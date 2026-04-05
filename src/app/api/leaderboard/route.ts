import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/schema";
import { getCached, setCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

const CATEGORIES = ["thai", "code", "math", "instruction", "creative", "knowledge", "vision", "audio"];

export async function GET() {
  try {
    const cached = getCached<unknown>("api:leaderboard");
    if (cached) return NextResponse.json(cached);

    const db = getDb();

    // Overall leaderboard
    const rows = db
      .prepare(`
        SELECT
          m.name,
          m.provider,
          m.model_id as modelId,
          m.tier,
          m.supports_vision as supportsVision,
          AVG(b.score) as avgScore,
          SUM(b.score) as totalScore,
          SUM(b.max_score) as maxScore,
          COUNT(b.id) as questionsAnswered,
          AVG(b.latency_ms) as avgLatencyMs
        FROM benchmark_results b
        INNER JOIN models m ON b.model_id = m.id
        GROUP BY b.model_id
        HAVING questionsAnswered >= 1
        ORDER BY avgScore DESC, totalScore DESC
      `)
      .all() as Array<{
      name: string;
      provider: string;
      modelId: string;
      tier: string;
      supportsVision: number;
      avgScore: number;
      totalScore: number;
      maxScore: number;
      questionsAnswered: number;
      avgLatencyMs: number;
    }>;

    // Per-category scores for each model
    const categoryStmt = db.prepare(`
      SELECT category, AVG(score) as avg_score, COUNT(*) as q_count
      FROM benchmark_results
      WHERE model_id = ?
      GROUP BY category
    `);

    const result = rows.map((r, i) => {
      // Get category breakdown
      const catRows = categoryStmt.all(r.modelId) as Array<{ category: string; avg_score: number; q_count: number }>;

      // Try with model internal ID if model_id didn't work
      let categories: Record<string, number> = {};
      if (catRows.length === 0) {
        // model_id in benchmark_results is actually models.id (e.g., "openrouter:xxx")
        const modelRow = db.prepare("SELECT id FROM models WHERE model_id = ? LIMIT 1").get(r.modelId) as { id: string } | undefined;
        if (modelRow) {
          const catRows2 = categoryStmt.all(modelRow.id) as Array<{ category: string; avg_score: number; q_count: number }>;
          categories = Object.fromEntries(catRows2.map(c => [c.category, Math.round(c.avg_score * 10) / 10]));
        }
      } else {
        categories = Object.fromEntries(catRows.map(c => [c.category, Math.round(c.avg_score * 10) / 10]));
      }

      return {
        rank: i + 1,
        name: r.name,
        provider: r.provider,
        modelId: r.modelId,
        avgScore: Math.round(r.avgScore * 100) / 100,
        totalScore: Math.round(r.totalScore * 100) / 100,
        maxScore: r.maxScore,
        percentage:
          r.maxScore > 0 ? Math.round((r.totalScore / r.maxScore) * 100) : 0,
        questionsAnswered: r.questionsAnswered,
        avgLatencyMs: Math.round(r.avgLatencyMs),
        tier: r.tier,
        supportsVision: r.supportsVision === 1,
        categories,
      };
    });

    setCache("api:leaderboard", result, 5000); // cache 5 seconds
    return NextResponse.json(result);
  } catch (err) {
    console.error("[leaderboard] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
