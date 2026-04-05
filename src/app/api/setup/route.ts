import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const VALID_PROVIDERS = new Set([
  "openrouter", "kilo", "google", "groq", "cerebras", "sambanova",
  "mistral", "ollama", "github", "fireworks", "cohere", "cloudflare", "huggingface",
]);

// GET: return saved keys (masked) + which providers have DB keys
export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT provider, api_key, updated_at FROM api_keys").all() as {
      provider: string;
      api_key: string;
      updated_at: string;
    }[];

    const result = rows.map((r) => ({
      provider: r.provider,
      hasDbKey: r.api_key.length > 0,
      maskedKey: maskKey(r.api_key),
      updatedAt: r.updated_at,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[setup] GET error:", err);
    return NextResponse.json([], { status: 500 });
  }
}

// POST: save or delete a key
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, apiKey } = body as { provider: string; apiKey: string };

    if (!provider || !VALID_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const db = getDb();

    if (!apiKey || apiKey.trim() === "") {
      // Delete key
      db.prepare("DELETE FROM api_keys WHERE provider = ?").run(provider);
      return NextResponse.json({ ok: true, action: "deleted" });
    }

    // Upsert key
    db.prepare(`
      INSERT INTO api_keys (provider, api_key, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, updated_at = datetime('now')
    `).run(provider, apiKey.trim());

    return NextResponse.json({ ok: true, action: "saved" });
  } catch (err) {
    console.error("[setup] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}
