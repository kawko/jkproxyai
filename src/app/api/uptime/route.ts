import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();

    // Provider uptime (last 24h): % of checks that were 'available'
    const uptimeStats = db.prepare(`
      SELECT
        m.provider,
        COUNT(*) as total_checks,
        SUM(CASE WHEN h.status = 'available' THEN 1 ELSE 0 END) as available_checks,
        ROUND(
          CAST(SUM(CASE WHEN h.status = 'available' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100,
          1
        ) as uptime_pct,
        ROUND(AVG(CASE WHEN h.status = 'available' THEN h.latency_ms ELSE NULL END)) as avg_latency_ms
      FROM health_logs h
      JOIN models m ON h.model_id = m.id
      WHERE h.checked_at >= datetime('now', '-24 hours')
      GROUP BY m.provider
      ORDER BY uptime_pct DESC
    `).all() as {
      provider: string;
      total_checks: number;
      available_checks: number;
      uptime_pct: number;
      avg_latency_ms: number | null;
    }[];

    // 7-day uptime per provider (for trend)
    const dailyUptime = db.prepare(`
      SELECT
        strftime('%Y-%m-%d', h.checked_at) as date,
        m.provider,
        ROUND(
          CAST(SUM(CASE WHEN h.status = 'available' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100,
          1
        ) as uptime_pct
      FROM health_logs h
      JOIN models m ON h.model_id = m.id
      WHERE h.checked_at >= datetime('now', '-7 days')
      GROUP BY date, m.provider
      ORDER BY date, m.provider
    `).all() as { date: string; provider: string; uptime_pct: number }[];

    // Recent incidents (cooldowns in last 24h)
    const incidents = db.prepare(`
      SELECT
        h.checked_at,
        m.provider,
        m.model_id,
        m.nickname,
        h.status,
        h.error,
        h.cooldown_until
      FROM health_logs h
      JOIN models m ON h.model_id = m.id
      WHERE h.checked_at >= datetime('now', '-24 hours')
        AND h.status NOT IN ('available')
      ORDER BY h.checked_at DESC
      LIMIT 30
    `).all() as {
      checked_at: string;
      provider: string;
      model_id: string;
      nickname: string | null;
      status: string;
      error: string | null;
      cooldown_until: string | null;
    }[];

    // Current cooldown count per provider
    const cooldownCounts = db.prepare(`
      SELECT
        m.provider,
        COUNT(DISTINCT m.id) as cooldown_count
      FROM health_logs h
      JOIN models m ON h.model_id = m.id
      WHERE h.cooldown_until > datetime('now')
      GROUP BY m.provider
    `).all() as { provider: string; cooldown_count: number }[];

    return NextResponse.json({
      uptimeStats,
      dailyUptime,
      incidents,
      cooldownCounts,
    });
  } catch (err) {
    console.error("[uptime] error:", err);
    return NextResponse.json({ uptimeStats: [], dailyUptime: [], incidents: [], cooldownCounts: [] }, { status: 500 });
  }
}
