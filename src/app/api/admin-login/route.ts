import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { password } = (await req.json()) as { password?: string };
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return Response.json({ ok: false, error: "ADMIN_PASSWORD not configured" }, { status: 503 });
    }
    return Response.json({ ok: password === expected });
  } catch {
    return Response.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}
