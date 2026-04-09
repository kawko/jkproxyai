import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId") ?? "";
    const db = getDb();
    const rows = db.prepare(`
      SELECT c.id, c.title, c.model_id, c.updated_at,
        COUNT(m.id) as message_count
      FROM chat_conversations c
      LEFT JOIN chat_messages m ON m.conversation_id = c.id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT 100
    `).all(userId) as { id: string; title: string; model_id: string | null; updated_at: string; message_count: number }[];
    return Response.json(rows);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, modelId, userId } = (await req.json()) as { title?: string; modelId?: string; userId?: string };
    const db = getDb();
    const id = uuidv4();
    db.prepare(
      "INSERT INTO chat_conversations (id, title, model_id, user_id) VALUES (?, ?, ?, ?)"
    ).run(id, title ?? "New Chat", modelId ?? null, userId ?? null);
    return Response.json({ id, title: title ?? "New Chat" });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
