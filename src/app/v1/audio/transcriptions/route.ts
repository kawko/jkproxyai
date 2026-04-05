import { openAIError } from "@/lib/openai-compat";

export const dynamic = "force-dynamic";

/**
 * POST /v1/audio/transcriptions — Speech-to-text (Whisper)
 * Stub: returns 501 with clear message
 */
export async function POST() {
  return openAIError(501, {
    message: "BCProxyAI does not support speech-to-text. Use OpenAI or Groq Whisper directly.",
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
