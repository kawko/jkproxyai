import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const conv = db.prepare("SELECT * FROM chat_conversations WHERE id = ?").get(id) as
      { id: string; title: string; model_id: string | null; created_at: string; updated_at: string } | undefined;
    if (!conv) return Response.json({ error: "Not found" }, { status: 404 });

    const messages = db.prepare(
      "SELECT id, role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC"
    ).all(id) as { id: string; role: string; content: string; created_at: string }[];

    return Response.json({ ...conv, messages });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { title } = (await req.json()) as { title?: string };
    const db = getDb();
    db.prepare("UPDATE chat_conversations SET title = ?, updated_at = datetime('now') WHERE id = ?")
      .run(title ?? "New Chat", id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare("DELETE FROM chat_conversations WHERE id = ?").run(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // POST /api/conversations/[id] with action=save_messages saves an array of messages
  try {
    const { id } = await params;
    const { messages } = (await req.json()) as {
      messages: { role: string; content: string }[];
    };
    const db = getDb();
    const insert = db.prepare(
      "INSERT OR IGNORE INTO chat_messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)"
    );
    const updateConv = db.prepare(
      "UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?"
    );
    const saveAll = db.transaction(() => {
      for (const msg of messages) {
        insert.run(uuidv4(), id, msg.role, msg.content);
      }
      updateConv.run(id);
    });
    saveAll();
    return Response.json({ ok: true, saved: messages.length });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
