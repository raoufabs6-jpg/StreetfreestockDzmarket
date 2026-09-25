# ⚡ AKMA Automation — StreetfreestockDzmarket

An automated marketing pipeline for Algerian (DZ) brands. A client fills in a brief; the workflow runs an AI analysis, then generates **three deliverables in parallel**: an analysis report, a marketing plan and a content pack. Everything shows up live on a dashboard.

```
                 AKMA AUTOMATION
                       │
              ┌────────▼────────┐
              │   Client Form   │  public/ (form view)         → POST /api/clients
              └────────┬────────┘
              ┌────────▼────────┐
              │   Automation    │  src/workflow.js             (orchestrator, step tracking, log)
              │    Workflow     │
              └────────┬────────┘
              ┌────────▼────────┐
              │   AI Analysis   │  src/ai.js · coreAnalysis    (readiness score, stage, budget tier)
              └────────┬────────┘
        ┌──────────────┼──────────────┐        ← Promise.all (parallel)
        ▼              ▼              ▼
   AI Analysis    Marketing Plan   Content     analysisReport · marketingPlan · contentPack
   (SWOT,persona, (budget split,   (captions, Darija,
    channel fit)   4-week plan,KPI) hashtags, ad copy, 7-day calendar)
        └──────────────┼──────────────┘
              ┌────────▼────────┐
              │    Dashboard    │  live updates via Server-Sent Events (/api/events)
              └─────────────────┘
```

## Quick start

```bash
npm start            # http://localhost:3000  (no npm install needed – zero dependencies)
npm test             # runs the full pipeline end-to-end
```

Requires Node.js ≥ 18.

### AI provider

| Mode | How |
|---|---|
| **Local engine** (default) | Rule-based generator tuned for the DZ market (58 wilayas, COD, Ouedkniss, Darija captions, DZD budgets). Works offline. |
| **OpenAI** | `OPENAI_API_KEY=sk-... npm start` (optional: `OPENAI_MODEL`, `OPENAI_BASE_URL` for any OpenAI-compatible API). If an LLM call fails, that step falls back to the local engine. |

Other env vars: `PORT` (3000), `HOST` (0.0.0.0), `DATA_DIR` (./data), `STEP_DELAY_MS` (600, a delay that makes each step's progress visible).

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/clients` | Submit a client form → starts the workflow (422 with field errors if invalid) |
| `GET` | `/api/clients` | List clients (summary) |
| `GET` | `/api/clients/:id` | Full record: steps, log, results `{core, analysis, marketing, content}` |
| `POST` | `/api/clients/:id/rerun` | Re-run the workflow |
| `DELETE` | `/api/clients/:id` | Delete |
| `GET` | `/api/stats` | Dashboard KPIs |
| `GET` | `/api/events` | SSE stream of live updates |

Data is stored in `data/clients.json`, which is git-ignored.

## Project structure

```
server.js           HTTP server, REST API, SSE, static files
src/workflow.js     Automation workflow / orchestrator
src/ai.js           AI stages (OpenAI or local engine)
src/store.js        JSON file store
public/             Frontend (form, pipeline view, dashboard) – vanilla JS
test/               node:test end-to-end test
```
