import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// Pricing per 1M tokens (USD) — ราคาจริงจาก official pricing pages (April 2026)
// Sources:
//   GPT-4o: https://openai.com/api/pricing/ ($2.50/$10 per 1M)
//   Claude Sonnet 4.6: https://platform.claude.com/docs/en/about-claude/pricing ($3/$15 per 1M)
//   Qwen Plus: https://www.alibabacloud.com/help/en/model-studio/model-pricing ($0.40/$1.20 per 1M)
//   Gemini 2.5 Pro: https://cloud.google.com/vertex-ai/generative-ai/pricing ($1.25/$10 per 1M)
//   DeepSeek V3: https://api-docs.deepseek.com/quick_start/pricing ($0.28/$0.42 per 1M — cache miss)
const PRICING = {
  gpt4o:   { input: 2.50,  output: 10.00, label: "GPT-4o" },
  claude:  { input: 3.00,  output: 15.00, label: "Claude Sonnet 4.6" },
  gemini:  { input: 1.25,  output: 10.00, label: "Gemini 2.5 Pro" },
  qwen:    { input: 0.40,  output: 1.20,  label: "Qwen Plus" },
  deepseek:{ input: 0.28,  output: 0.42,  label: "DeepSeek V3" },
};

const USD_TO_THB = 33.5; // อัตราแลกเปลี่ยนโดยประมาณ (April 2026)

export async function GET() {
  try {
    const db = getDb();

    // All-time totals
    const allTime = db
      .prepare(
        `SELECT
          COALESCE(SUM(input_tokens), 0) AS total_input,
          COALESCE(SUM(output_tokens), 0) AS total_output
        FROM token_usage`
      )
      .get() as { total_input: number; total_output: number };

    // Today totals
    const today = new Date().toISOString().slice(0, 10);
    const todayUsage = db
      .prepare(
        `SELECT
          COALESCE(SUM(input_tokens), 0) AS total_input,
          COALESCE(SUM(output_tokens), 0) AS total_output
        FROM token_usage
        WHERE created_at >= ?`
      )
      .get(`${today}T00:00:00`) as { total_input: number; total_output: number };

    // Total requests
    const totalRequests = (db.prepare("SELECT COUNT(*) as c FROM token_usage").get() as { c: number }).c;
    const todayRequests = (db.prepare("SELECT COUNT(*) as c FROM token_usage WHERE created_at >= ?").get(`${today}T00:00:00`) as { c: number }).c;

    const calcCost = (input: number, output: number, pricing: { input: number; output: number }) =>
      (input / 1_000_000) * pricing.input + (output / 1_000_000) * pricing.output;

    const r = (n: number) => Math.round(n * 10000) / 10000;

    // Calculate cost for each provider
    const providers = Object.entries(PRICING).map(([key, p]) => {
      const cost = calcCost(allTime.total_input, allTime.total_output, p);
      const todayCost = calcCost(todayUsage.total_input, todayUsage.total_output, p);
      return {
        id: key,
        label: p.label,
        inputPrice: p.input,
        outputPrice: p.output,
        cost: r(cost),
        costThb: r(cost * USD_TO_THB),
        todayCost: r(todayCost),
        todayCostThb: r(todayCost * USD_TO_THB),
      };
    });

    const maxCost = Math.max(...providers.map(p => p.cost));
    const todayMaxCost = Math.max(...providers.map(p => p.todayCost));

    return NextResponse.json({
      totalInputTokens: allTime.total_input,
      totalOutputTokens: allTime.total_output,
      totalTokens: allTime.total_input + allTime.total_output,
      totalRequests,
      todayRequests,
      providers,
      actualCost: 0,
      totalSaved: r(maxCost),
      totalSavedThb: r(maxCost * USD_TO_THB),
      todaySaved: r(todayMaxCost),
      todaySavedThb: r(todayMaxCost * USD_TO_THB),
      usdToThb: USD_TO_THB,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
