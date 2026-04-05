import { getDb } from "@/lib/db/schema";

/**
 * Prompt categories for smart routing
 * Detects what kind of prompt the user sent
 */
const CATEGORY_PATTERNS: [string, RegExp[]][] = [
  ["code", [/```/, /function\s/, /class\s/, /import\s/, /const\s/, /def\s/, /console\.log/, /return\s/, /เขียนโค้ด/i, /write.*code/i]],
  ["thai", [/[\u0E00-\u0E7F]{3,}/]],
  ["math", [/\d+\s*[\+\-\*\/\=]\s*\d+/, /equation/, /calculate/, /formula/i, /คำนวณ/, /สมการ/]],
  ["creative", [/write\s+a\s+(story|poem|song)/i, /creative/i, /imagine/i, /fiction/i, /แต่ง/, /กลอน/, /นิทาน/]],
  ["instruction", [/json/i, /format/i, /ตอบเป็น/, /ตามรูปแบบ/]],
  ["knowledge", [/อธิบาย/, /explain/i, /what\s+is/i, /คืออะไร/]],
  ["vision", [/ดูรูป/, /ภาพนี้/, /รูปนี้/, /image/i, /picture/i, /photo/i]],
  ["analysis", [/analyze/i, /compare/i, /evaluate/i, /pros\s+and\s+cons/i, /summarize/i, /summary/i, /วิเคราะห์/, /เปรียบเทียบ/]],
  ["translate", [/translate/i, /แปล/]],
];

export function detectPromptCategory(userMessage: string): string {
  if (!userMessage) return "general";
  for (const [cat, patterns] of CATEGORY_PATTERNS) {
    for (const p of patterns) {
      if (p.test(userMessage)) return cat;
    }
  }
  return "general";
}

/**
 * Record a routing result for learning
 */
export function recordRoutingResult(
  modelId: string,
  provider: string,
  promptCategory: string,
  success: boolean,
  latencyMs: number
): void {
  try {
    const db = getDb();
    db.prepare(
      "INSERT INTO routing_stats (model_id, provider, prompt_category, success, latency_ms) VALUES (?, ?, ?, ?, ?)"
    ).run(modelId, provider, promptCategory, success ? 1 : 0, latencyMs);
  } catch { /* non-critical */ }
}

/**
 * Get best models for a given prompt category
 * Returns model IDs sorted by success rate * inverse latency
 */
export function getBestModelsForCategory(promptCategory: string): string[] {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT model_id,
        COUNT(*) as total,
        SUM(success) as successes,
        AVG(latency_ms) as avg_lat,
        CAST(SUM(success) AS REAL) / COUNT(*) as success_rate
      FROM routing_stats
      WHERE prompt_category = ?
        AND created_at >= datetime('now', '-7 days')
      GROUP BY model_id
      HAVING total >= 3
      ORDER BY success_rate DESC, avg_lat ASC
      LIMIT 10
    `).all(promptCategory) as { model_id: string }[];
    return rows.map(r => r.model_id);
  } catch {
    return [];
  }
}

/**
 * Get models ranked by benchmark score for a specific category
 * Used to prioritize models that are strong in the requested area
 */
export function getBestModelsByBenchmarkCategory(category: string): string[] {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT model_id, AVG(score) as avg_score, COUNT(*) as q_count
      FROM benchmark_results
      WHERE category = ?
      GROUP BY model_id
      HAVING q_count >= 1 AND avg_score >= 5
      ORDER BY avg_score DESC
      LIMIT 20
    `).all(category) as { model_id: string; avg_score: number }[];
    return rows.map(r => r.model_id);
  } catch {
    return [];
  }
}

/**
 * Emit a system event (School Bell)
 */
export function emitEvent(
  type: string,
  title: string,
  detail?: string,
  provider?: string,
  modelId?: string,
  severity: "info" | "warn" | "error" | "success" = "info"
): void {
  try {
    const db = getDb();
    db.prepare(
      "INSERT INTO events (type, title, detail, provider, model_id, severity) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(type, title, detail ?? null, provider ?? null, modelId ?? null, severity);
  } catch { /* non-critical */ }
}
