import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const since = req.nextUrl.searchParams.get("since");

    let events;
    if (since) {
      events = db.prepare(`
        SELECT * FROM events
        WHERE created_at > ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(since);
    } else {
      events = db.prepare(`
        SELECT * FROM events
        WHERE created_at >= datetime('now', '-1 hour')
        ORDER BY created_at DESC
        LIMIT 50
      `).all();
    }

    return NextResponse.json({ events });
  } catch (err) {
    console.error("[events] error:", err);
    return NextResponse.json({ events: [] }, { status: 500 });
  }
}
