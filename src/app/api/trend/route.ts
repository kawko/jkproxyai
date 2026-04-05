import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();

    // Daily benchmark scores (last 14 days) per provider
    const benchmarkTrend = db.prepare(`
      SELECT
        strftime('%Y-%m-%d', br.tested_at) as date,
        m.provider,
        ROUND(AVG(br.score), 2) as avg_score,
        COUNT(DISTINCT m.id) as models_tested
      FROM benchmark_results br
      JOIN models m ON br.model_id = m.id
      WHERE br.tested_at >= datetime('now', '-14 days')
      GROUP BY date, m.provider
      ORDER BY date, m.provider
    `).all() as { date: string; provider: string; avg_score: number; models_tested: number }[];

    // Daily complaint rate (last 14 days) per provider
    const complaintTrend = db.prepare(`
      SELECT
        strftime('%Y-%m-%d', c.created_at) as date,
        m.provider,
        COUNT(*) as complaints,
        SUM(CASE WHEN c.status = 'exam_failed' THEN 1 ELSE 0 END) as failed_exams
      FROM complaints c
      JOIN models m ON c.model_id = m.id
      WHERE c.created_at >= datetime('now', '-14 days')
      GROUP BY date, m.provider
      ORDER BY date, m.provider
    `).all() as { date: string; provider: string; complaints: number; failed_exams: number }[];

    // Daily latency trend per provider
    const latencyTrend = db.prepare(`
      SELECT
        strftime('%Y-%m-%d', created_at) as date,
        provider,
        ROUND(AVG(latency_ms)) as avg_latency,
        COUNT(*) as requests
      FROM gateway_logs
      WHERE created_at >= datetime('now', '-14 days')
        AND status >= 200 AND status < 300
        AND provider IS NOT NULL
      GROUP BY date, provider
      ORDER BY date, provider
    `).all() as { date: string; provider: string; avg_latency: number; requests: number }[];

    // Get list of unique dates (last 14 days)
    const dates: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dates.push(d.toISOString().slice(0, 10));
    }

    return NextResponse.json({
      dates,
      benchmarkTrend,
      complaintTrend,
      latencyTrend,
    });
  } catch (err) {
    console.error("[trend] error:", err);
    return NextResponse.json({ dates: [], benchmarkTrend: [], complaintTrend: [], latencyTrend: [] }, { status: 500 });
  }
}
