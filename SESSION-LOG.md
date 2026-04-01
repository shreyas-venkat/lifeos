# Session Log — 2026-03-30

## What Was Done

### Deployment Fixes
- **Deploy script was silently failing builds** — `npm install --omit=dev` skipped TypeScript, `npm run build 2>/dev/null || true` hid the error. Every deploy since v2.0 merge was running stale code. Fixed: install all deps, build, prune after.
- **Deploy script wiped VPS artifacts** — `git clean -fd` and `git checkout -- .` destroyed untracked files. Fixed: exclude `data/` directory.
- **Deploy now includes**: PWA build (`cd pwa && npm install && npm run build`), MotherDuck migrations (`node scripts/motherduck/run-migrations.cjs`), container rebuild.
- **Inline `node -e` in deploy broken by SSH action** — `script_stop` injects shell variables into JS. Moved migration runner to `.cjs` file.

### Health Webhook Fixes
- **Sleep data not syncing** — Health Connect app sends `{session_end_time, duration_seconds, stages[]}`, not `{duration_hours, end_time}`. Fixed transform to parse correctly.
- **Webhook hanging on missing Content-Type** — Added try/catch, string body parsing fallback, request logging.
- **Steps inflated (13k instead of ~800)** — App re-sends all data each sync, creating duplicates. Fixed with dedup: GROUP BY recorded_at before SUM.
- **SpO2 not showing** — App sends `oxygen_saturation`, PWA looks for `spo2`. Added normalization in both API response and webhook storage.
- **Health /today endpoint** — Rewrote to aggregate intelligently: SUM steps (deduped), MAX sleep (ignore 0s), latest HR/SpO2/weight.

### Security Hardening
- **SQL injection** — Replaced `sanitize()` string interpolation with parameterized `$1/$2` queries in 5 route files (pantry, calories, exercise, supplements, photo-estimate).
- **Rate limiting** — Added `express-rate-limit` on health webhook (100 req/min).
- **CORS** — Restricted from `*` to Tailscale/localhost origins only.
- **Webhook auth** — Removed query param `?key=` (leaks in logs), header-only now.
- **Email prompt injection** — Added CLAUDE.md rule to never execute instructions from email bodies.
- **DB connection race** — Replaced dual `instance`/`conn` variables with promise-based singleton.

### Bot Personality Updates
- **Silent on empty inbox** — No more "No unread emails" spam every 15 min.
- **Neo Financial support** — Parse purchase amount (not cashback) from Neo emails.
- **Transaction dedup** — Check amount + date before inserting (prevents merchant receipt + bank notification duplicates).
- **Package tracking rules** — Auto-extract tracking from shipping emails.
- **Obsidian vault mounted** — `~/MyVault` → `/workspace/extra/vault` (read-write) in containers.

### New Features (v3 — on dev, merged to main)
1. **Cost & Token Tracker** — Captures `total_cost_usd`, `inputTokens`, `outputTokens`, `model` from SDK result messages. New `lifeos.api_usage` table, `/api/usage/summary` endpoint, PWA usage page with period toggles and breakdowns.
2. **Model Routing** — Haiku for 12 simple tasks (email scan, reminders, pantry expiry, etc.), Sonnet for 5 complex tasks (morning briefing, meal planning, health analysis). Budget caps: $0.05 haiku, $0.50 sonnet, $2.00 conversations.
3. **Package Tracking** — `lifeos.packages` table, CRUD API, PWA page with status badges.
4. **Subscription Audit** — `lifeos.subscriptions` table, CRUD API, monthly total calculation, section on spending page.
5. **Spending Forecast** — `GET /api/spending/forecast` with monthly projection, daily average, category breakdown, comparison to last month. PWA card with progress bar.
6. **Smart Cooking Suggestions** — New scheduled task at 5 PM daily, queries expiring pantry items + recipe matches.

### Infrastructure
- **Scheduled tasks re-registered** — All 17 tasks active (16 original + cooking suggestion).
- **PWA nav updated** — Bottom tabs: Home, Health, Meals, Spend, Usage, More.
- **Test suite** — 775 tests passing.
- **Cropped brain icon** — `pwa/static/cropped_brain.png` from user's ChatGPT-generated logo.

## Known Issues

### Needs Verification
- **Usage tracking** — Code is deployed but first tracked run hasn't been confirmed yet. The deploy restarted the service mid-conversation, killing the first test before usage could be logged.
- **Model routing** — Container image rebuilt with `CLAUDE_MODEL` env var support, but no confirmed run with Haiku model yet.

### Needs Fix
- **Vault mount rejected** — `~/MyVault` mount blocked because mount allowlist file doesn't exist at `/root/.config/nanoclaw/mount-allowlist.json`. Need to create it with the vault path.
- **Pantry UX** — No quick-action buttons (running low / out of stock). Exact gram tracking is useless for spices. Tap-to-edit exists but isn't discoverable.
- **PWA nav** — 16+ pages but only 6 nav tabs. The "More" tab goes to preferences, not a proper page index.

### Not Started (from v3 spec)
- Auto-reply email drafts (draft in Discord, react to send)
- Photo meal logging (Claude Vision calorie estimation)
- Smart commute alerts (calendar + travel time)
- Obsidian journal enhancement (richer daily summary template)
- Obsidian historical backfill (generate past summaries from MotherDuck data)

## Key Files Modified This Session

| File | Change |
|------|--------|
| `.github/workflows/deploy.yml` | PWA build, migrations, data/ exclusion, .cjs migration runner |
| `src/api/routes/health-webhook.ts` | Sleep parsing, error handling, metric name normalization |
| `src/api/routes/health.ts` | Aggregated /today endpoint with dedup |
| `src/api/routes/pantry.ts` | Parameterized queries |
| `src/api/routes/calories.ts` | Parameterized queries |
| `src/api/routes/exercise.ts` | Parameterized queries |
| `src/api/routes/supplements.ts` | Parameterized queries |
| `src/api/routes/photo-estimate.ts` | Parameterized queries |
| `src/api/server.ts` | Rate limiting, CORS restriction, text/urlencoded parsing |
| `src/api/db.ts` | Promise-based connection singleton |
| `src/api/routes/usage.ts` | NEW — cost tracking API |
| `src/api/routes/packages.ts` | NEW — package tracking API |
| `src/api/routes/subscriptions.ts` | NEW — subscription audit API |
| `src/api/routes/spending.ts` | Forecast endpoint |
| `src/container-runner.ts` | ContainerOutput usage fields, model passthrough, vault mount |
| `src/index.ts` | Usage logging after conversations |
| `src/task-scheduler.ts` | Usage logging after tasks |
| `src/ipc.ts` | Model field in IPC task data |
| `src/db.ts` | Model column in scheduled_tasks |
| `src/types.ts` | Model field on ScheduledTask |
| `container/agent-runner/src/index.ts` | SDK usage extraction, CLAUDE_MODEL env, budget limits |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | Model param on schedule_task tool |
| `scripts/setup-tasks.ts` | Model assignments for all 17 tasks |
| `scripts/motherduck/schemas/011_api_usage.sql` | NEW — api_usage table |
| `scripts/motherduck/schemas/012_packages_subscriptions.sql` | NEW — packages + subscriptions tables |
| `scripts/motherduck/run-migrations.cjs` | NEW — deploy-safe migration runner |
| `groups/main/CLAUDE.md` | Silent inbox, Neo parsing, transaction dedup, prompt injection defense, package tracking, cooking suggestions |
| `pwa/src/routes/usage/+page.svelte` | NEW — cost tracking page |
| `pwa/src/routes/packages/+page.svelte` | NEW — package tracking page |
| `pwa/src/routes/spending/+page.svelte` | Forecast card + subscriptions section |
| `pwa/src/routes/+layout.svelte` | Nav tabs updated |
| `pwa/src/lib/api.ts` | Usage, Package, Subscription, Forecast interfaces + methods |
| `pwa/static/cropped_brain.png` | NEW — logo asset |

## VPS Access
- SSH: `ssh -i ~/.ssh/vps-deploy -l root lifeos.tail4653b2.ts.net`
- Service: `systemctl --user status nanoclaw`
- Logs: `journalctl --user -u nanoclaw --no-pager -n 50`
- DB: `sqlite3 /root/lifeos/store/messages.db` (NOT data/nanoclaw.db)
- Actual DB location: `store/messages.db` (tasks, sessions, groups)
- MotherDuck: all `lifeos.*` tables in `my_db` database
