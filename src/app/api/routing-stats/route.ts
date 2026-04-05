import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();

    // Per-category best models (last 7 days)
    const categoryStats = db.prepare(`
      SELECT
        rs.prompt_category,
        rs.model_id,
        rs.provider,
        m.nickname,
        COUNT(*) as total,
        SUM(rs.success) as successes,
        ROUND(CAST(SUM(rs.success) AS REAL) / COUNT(*) * 100, 1) as success_rate,
        ROUND(AVG(rs.latency_ms)) as avg_latency_ms
      FROM routing_stats rs
      JOIN models m ON rs.model_id = m.id
      WHERE rs.created_at >= datetime('now', '-7 days')
      GROUP BY rs.prompt_category, rs.model_id
      HAVING total >= 2
      ORDER BY rs.prompt_category, success_rate DESC, avg_latency_ms ASC
    `).all() as {
      prompt_category: string;
      model_id: string;
      provider: string;
      nickname: string | null;
      total: number;
      successes: number;
      success_rate: number;
      avg_latency_ms: number;
    }[];

    // Group by category
    const categories: Record<string, typeof categoryStats> = {};
    for (const row of categoryStats) {
      (categories[row.prompt_category] ??= []).push(row);
    }

    // Overall routing distribution
    const distribution = db.prepare(`
      SELECT prompt_category, COUNT(*) as count
      FROM routing_stats
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY prompt_category
      ORDER BY count DESC
    `).all() as { prompt_category: string; count: number }[];

    // Total requests learned from
    const totalRow = db.prepare(`
      SELECT COUNT(*) as total FROM routing_stats WHERE created_at >= datetime('now', '-7 days')
    `).get() as { total: number };

    return NextResponse.json({
      categories,
      distribution,
      totalLearned: totalRow.total,
    });
  } catch (err) {
    console.error("[routing-stats] error:", err);
    return NextResponse.json({ categories: {}, distribution: [], totalLearned: 0 }, { status: 500 });
  }
}
