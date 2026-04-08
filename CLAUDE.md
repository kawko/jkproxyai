# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

## Commands

All commands must be run via `rtk` (the remote task runner) when in the Docker context. For local dev only, omit `rtk`.

```bash
# Build
rtk npx next build

# Run tests (Vitest)
rtk npx vitest run

# Run a single test file
rtk npx vitest run src/lib/worker/__tests__/health.test.ts

# Watch mode
rtk npx vitest

# Lint
rtk npx eslint

# Build MCP server
rtk npm run build:mcp
```

## Architecture

BCProxyAI is an OpenAI-compatible API gateway (Next.js 16, App Router) that proxies requests across multiple AI providers with intelligent routing, health checking, and a real-time dashboard.

### Request Flow (`/v1/*`)

Client → `src/app/v1/chat/completions/route.ts` (main gateway)

1. **Budget check** — blocks at 95% daily token limit (SQLite `budget_config` + `token_usage`)
2. **Model resolution** — maps requested model ID to a `(provider, model_id)` pair from DB
3. **Smart routing** — `src/lib/routing-learn.ts` scores models by prompt category (code/thai/math/creative/etc.) using `routing_stats` table; falls back to health/benchmark scores
4. **Provider cooldown** — in-memory `Map` per provider (fast path) + per-key cooldown via `src/lib/api-keys.ts`
5. **Failover** — tries up to 3 candidate models before returning error
6. **Response normalization** — `src/lib/openai-compat.ts` enforces OpenAI field spec on every response
7. **Post-request** — logs to `gateway_logs`, tracks token usage, runs `autoDetectComplaint`

Other `/v1/` routes (embeddings, images, audio, completions, models) follow the same pattern but simpler.

### Background Worker (`src/lib/worker/`)

Runs in the Next.js process via `startWorker()` (called from `/api/worker/route.ts` on first request). Executes every 1 hour:

- **scanner.ts** — fetches model lists from each provider, upserts into `models` table
- **health.ts** — pings each model with a lightweight request, records latency/status in `health_logs`, sets per-model cooldown
- **benchmark.ts** — (disabled; score now derived from live traffic) runs scored Q&A tests
- **complaint.ts** — auto-generates complaint re-exams for models that received complaints

### Database (`src/lib/db/schema.ts`)

Single SQLite file at `data/bcproxyai.db` (WAL mode). Schema is auto-migrated at startup. Key tables:

| Table | Purpose |
|-------|---------|
| `models` | All discovered models with capabilities & pricing |
| `health_logs` | Per-model health check history + cooldown timestamps |
| `gateway_logs` | Every proxied request (30-day retention) |
| `routing_stats` | Per-category success/latency for smart routing |
| `complaints` / `complaint_exams` | AI-detected quality failures and re-test results |
| `token_usage` | Daily token tracking for budget enforcement |
| `events` | Real-time School Bell notification log |
| `api_keys` | Web-managed provider keys (fallback to `.env`) |

### API Key Lookup (`src/lib/api-keys.ts`)

Priority: `.env` comma-separated keys → SQLite `api_keys` table. Supports round-robin rotation and per-key 429 cooldown. The environment variable names per provider are defined in `ENV_MAP`.

### Providers (`src/lib/providers.ts`)

Supported: openrouter, kilo, google, groq, cerebras, sambanova, mistral, ollama, github, fireworks, cohere, cloudflare, huggingface. Each has a chat completions URL; some support embeddings and legacy completions.

### Frontend Dashboard (`src/app/page.tsx`, `src/components/`)

Single-page React dashboard with tabs: ModelGrid, Analytics, TrendPanel, UptimePanel, SpeedRace, MascotScene (Battle Theater), CostOptimizerPanel, RoutingLearnPanel, SchoolBellPanel, ComplaintPanel, ChatPanel. All data fetched from `/api/*` routes.

### MCP Server

Built separately via `npm run build:mcp` → `dist/mcp/server.js`. Config files: `mcp-config.hiclaw.json`, `mcp-config.openclaw.json`.
