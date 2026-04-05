// API Key Rotation — round-robin + cooldown on 429
import { getDb } from "@/lib/db/schema";

const keyIndexMap = new Map<string, number>();
const cooldownMap = new Map<string, number>(); // "provider:key" -> cooldown until timestamp

const ENV_MAP: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  kilo: "KILO_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  sambanova: "SAMBANOVA_API_KEY",
  mistral: "MISTRAL_API_KEY",
  ollama: "OLLAMA_API_KEY",
  github: "GITHUB_MODELS_TOKEN",
  fireworks: "FIREWORKS_API_KEY",
  cohere: "COHERE_API_KEY",
  cloudflare: "CLOUDFLARE_API_TOKEN",
  huggingface: "HF_TOKEN",
};

// Cache DB keys for 30s to avoid hitting DB on every request
let dbKeysCache: Record<string, string> = {};
let dbKeysCacheTime = 0;

function getDbKey(provider: string): string {
  const now = Date.now();
  if (now - dbKeysCacheTime > 30_000) {
    try {
      const db = getDb();
      const rows = db.prepare("SELECT provider, api_key FROM api_keys").all() as { provider: string; api_key: string }[];
      dbKeysCache = {};
      for (const r of rows) dbKeysCache[r.provider] = r.api_key;
      dbKeysCacheTime = now;
    } catch { /* ignore */ }
  }
  return dbKeysCache[provider] ?? "";
}

// Clean expired entries every 100 calls
let callCount = 0;
function cleanExpired() {
  callCount++;
  if (callCount % 100 !== 0) return;
  const now = Date.now();
  for (const [key, until] of cooldownMap.entries()) {
    if (until < now) cooldownMap.delete(key);
  }
}

export function getNextApiKey(provider: string): string {
  cleanExpired();
  const envVar = ENV_MAP[provider];
  if (!envVar) return "";

  // Priority: .env > DB
  let raw = process.env[envVar] ?? "";
  const envKeys = raw.split(",").map((k) => k.trim()).filter(Boolean);

  // Fallback to DB key if no env key
  if (envKeys.length === 0) {
    const dbKey = getDbKey(provider);
    if (dbKey) raw = dbKey;
  } else {
    raw = envKeys.join(",");
  }

  const keys = raw.split(",").map((k) => k.trim()).filter(Boolean);
  // Ollama ไม่ต้อง key — ใส่ default "ollama"
  if (keys.length === 0 && provider === "ollama") return "ollama";
  if (keys.length === 0) return "";

  // Filter out cooled-down keys
  const now = Date.now();
  const available = keys.filter((k) => {
    const cd = cooldownMap.get(`${provider}:${k}`);
    return !cd || cd < now;
  });

  // Fallback to all keys if every key is in cooldown
  const pool = available.length > 0 ? available : keys;
  const idx = (keyIndexMap.get(provider) ?? 0) % pool.length;
  keyIndexMap.set(provider, idx + 1);

  return pool[idx];
}

export function markKeyCooldown(provider: string, key: string, durationMs = 300000) {
  cooldownMap.set(`${provider}:${key}`, Date.now() + durationMs);
}

/**
 * Get all keys for a provider as a record (for health/benchmark that read at module level).
 * Returns the first available key per provider.
 */
export function getApiKeysRecord(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const provider of Object.keys(ENV_MAP)) {
    result[provider] = getNextApiKey(provider);
  }
  return result;
}
