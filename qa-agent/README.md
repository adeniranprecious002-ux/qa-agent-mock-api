# QA-Agent — AI Regression & Calculation Guard

An autonomous QA pipeline that continuously validates API responses and
recomputes business calculations independently, using an LLM to explain
*why* a check failed and suggest the next test to run — not just flag
that something's wrong.

Built as a demonstration of applying AI-agent engineering to QA, for
health/wellness-style calculation validation (HRV-derived stress
scoring), rather than traditional UI test automation.

## Why this exists

Most QA automation checks "did the page load" or "did the button work."
This checks something harder to verify: **is the number correct.**
It re-derives the expected value from raw input data, compares it to
what the API actually returned, and — when they disagree — asks an LLM
to reason about the likely root cause (rounding, stale cache, formula
drift, bad input) instead of just throwing a threshold alert.

## Architecture

```
Cron (every 15 min)
  → Define users to check
  → Fetch stress data from API (per user)
  → Recompute expected value independently, compare to actual
  → Anomaly?
      ├── No  → log PASS to Supabase
      └── Yes → ask LLM to explain root cause
                → send Telegram alert (with AI explanation)
                → log ANOMALY + explanation to Supabase

Separate Error Trigger workflow catches pipeline-level failures
(API down, timeout, etc.) and alerts independently — so a crash in
validation logic never gets confused with an anomaly in the data itself.
```

## What's in this repo

| Path | Purpose |
|---|---|
| `mock-api/` | Express API that returns HRV-based stress scores, with a seeded calculation bug on one user (`buggy-user`) so the pipeline has a real anomaly to catch |
| `n8n/QA-Agent-workflow.json` | Full importable n8n workflow: schedule → fetch → validate → LLM explain → alert → log |
| `supabase/schema.sql` | Table + dedupe index (prevents duplicate alerts at the DB layer, not in application code) + RLS policies |
| `dashboard/index.html` | Standalone dashboard, no build step — reads live results straight from Supabase |

## Setup

### 1. Mock API
```bash
cd mock-api
npm install
npm start
# runs on http://localhost:3000
# GET /api/vitals/user-001/stress   -> clean
# GET /api/vitals/buggy-user/stress -> seeded bug
```
Deploy this somewhere n8n can reach it (Render free tier works, same as
the existing n8n instance setup).

### 2. Supabase
Run `supabase/schema.sql` in the SQL editor of your Supabase project.
This creates `qa_checks` with a generated `checked_hour` column and a
unique index on `(endpoint, checked_hour, status)` — so retries or
flapping values can't create duplicate alert rows.

### 3. n8n workflow
Import `n8n/QA-Agent-workflow.json` into n8n. Set these environment
variables (or swap for n8n credentials):

- `QA_API_BASE_URL` — where the mock API is deployed
- `ANTHROPIC_API_KEY`
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`

Activate the workflow. It runs every 15 minutes, checks 3 users
(2 clean, 1 seeded-buggy), and should produce its first Telegram
alert + Supabase anomaly row within the first run against `buggy-user`.

### 4. Dashboard
Open `dashboard/index.html`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY`
at the top of the script. No build step — works as a static file or
hosted on Netlify alongside the rest of the portfolio.

## Design decisions worth calling out

- **Tolerance bands, not exact-match checks** — floating-point HRV math
  will never match to the decimal; the validator flags real drift
  (>3 point delta) without generating false positives on rounding noise.
- **Severity tiers** (`none` / `medium` / `high`) so alerting can scale —
  medium severity logs quietly, high severity pages immediately.
- **DB-layer dedup** over application-layer dedup — a UNIQUE constraint
  is more reliable than trying to track "have I already alerted on this"
  in workflow logic.
- **LLM output is supporting evidence, not the source of truth** — the
  dashboard always shows the raw expected/actual/delta numbers alongside
  the AI's explanation, so a hallucinated root cause can never quietly
  replace the actual data.
- **Isolated error handling** — pipeline failures (API timeout, bad
  response) are caught by a separate Error Trigger workflow so they're
  never mistaken for a data anomaly in the alert stream.

## What this demonstrates

Not "I can write test scripts" — it's "I can build a system that catches
a class of bug (calculation drift) that traditional UI automation
wouldn't see, and have it reason about root cause autonomously." That's
the gap between conventional test automation and AI-native QA tooling.
