import { openAIError } from "@/lib/openai-compat";

export const dynamic = "force-dynamic";

/**
 * POST /v1/images/generations — Image generation (DALL-E)
 * Stub: returns 501 with clear message
 */
export async function POST() {
  return openAIError(501, {
    message: "BCProxyAI does not support image generation. Use OpenAI DALL-E or Stability AI directly.",
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
