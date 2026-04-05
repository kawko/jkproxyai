import { openAIError } from "@/lib/openai-compat";

export const dynamic = "force-dynamic";

/**
 * POST /v1/audio/speech — Text-to-speech
 * Stub: returns 501 with clear message so clients degrade gracefully
 */
export async function POST() {
  return openAIError(501, {
    message: "BCProxyAI does not support text-to-speech. Use OpenAI directly for /v1/audio/speech.",
    code: "not_implemented",
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
