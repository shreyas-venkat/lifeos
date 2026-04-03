# Migration: Express API to Direct MotherDuck WASM Queries

## Context

LifeOS has ~28,000 lines of API + test code (28 Express route files + 28 test files) that exist solely to proxy SQL queries between the SvelteKit PWA and MotherDuck. 94% of these routes are pure SQL passthrough -- receive HTTP request, run SQL, return JSON. A friend's equivalent NanoClaw setup does the same thing with ~800 lines total because the PWA queries MotherDuck directly.

**Goal:** Replace the Express API layer with `@motherduck/wasm-client` (MotherDuck's official browser SDK that runs DuckDB via WebAssembly). Keep Express only for 2 endpoints that genuinely need a server (health webhook from phone, Google Calendar API).

**Net result:** Delete ~36,000 lines (routes + tests), add ~1,500 lines (WASM client + domain helpers).

## Approach: MotherDuck WASM Client (direct browser queries)

The PWA will run DuckDB in the browser via WebAssembly and connect directly to MotherDuck cloud. No API middleman.

- **Why not a thin SQL proxy instead?** A generic `POST /api/sql` endpoint would still require Express running. The whole point is eliminating that dependency.
- **Token exposure?** The app is Tailscale-only. The token will be baked into the Vite build (`import.meta.env.VITE_MOTHERDUCK_TOKEN`). Acceptable for a personal app on a private network.
- **WASM requirements:** Needs `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` headers from nginx. One-time config change.

## Migration Strategy: Incremental

Migrate route-by-route, keeping Express running in parallel. Each phase produces a working app. No big-bang rewrite.

---

## Phase 0: Foundation (~80 lines new code)

**Add WASM client and prove it works with one endpoint.**

### Files to create/modify:
| File | Action |
|------|--------|
| `pwa/package.json` | Add `@motherduck/wasm-client` dependency |
| `pwa/src/lib/db.ts` | **NEW** -- WASM connection singleton + typed `query<T>()` function |
| `pwa/.env` | Add `VITE_MOTHERDUCK_TOKEN` |
| VPS: `/etc/nginx/sites-enabled/lifeos` | Add COEP/COOP headers to `/app` location block |

### `pwa/src/lib/db.ts` design:
- Singleton `MDConnection` initialization (mirrors pattern in `src/api/db.ts:6-20`)
- Reuse the same type normalization logic from `src/api/db.ts:30-50` (BigInt -> Number, micros -> ISO string, days -> date string)
- Export `query<T>(sql, ...params): Promise<T[]>` and `queryOrDefault<T>(sql, fallback, ...params): Promise<T>`
- Call `USE my_db` on init

### nginx change:
```nginx
location /app {
    alias /root/lifeos/pwa/build;
    try_files $uri $uri/ /app/index.html;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
}
```
Note: Do NOT add these headers to `/api` block -- would break health-webhook and calendar external calls.

### Smoke test:
Swap `api.water.today()` (simplest endpoint -- 1 SQL query, 49-line route) to use WASM query. Verify it renders correctly.

---

## Phase 1: Migrate 17 Pure SQL Passthrough Routes

**Rewrite `pwa/src/lib/api.ts` internals from `fetchApi()` to `query()`. Keep the same `api.xxx.yyy()` interface so Svelte pages don't change at all.**

### Routes to migrate (all are simple CRUD/SELECT):
`bills` `water` `reminders` `notifications` `preferences` `export` `pantry` `body` `mood` `usage` `packages` `subscriptions` `supplements` `calories` `exercise` `health` `photo-estimate`

### Pattern for each:
```typescript
// BEFORE (fetch via Express)
today: () => fetchSafe<CalorieEntry[]>(`/calories/today?date=${localDateStr()}`, []),

// AFTER (direct SQL via WASM)
today: async () => queryOrDefault<CalorieEntry[]>(
  `SELECT * FROM lifeos.calorie_log WHERE log_date = $1 ORDER BY created_at`, [],
  localDateStr()
),
```

### Write operations:
- `crypto.randomUUID()` for ID generation (available in all modern browsers)
- Input validation moves inline into the api.ts methods
- INSERTs/UPDATEs/DELETEs run directly via `query()`

### No Svelte page changes needed -- the `api` export interface stays identical.

---

## Phase 2: Migrate 8 Complex Routes (business logic)

**Move JS business logic from Express routes into `pwa/src/lib/domain/` helper modules. SQL stays the same, just runs via WASM instead of Node.**

### New files:
| File | From route | LOC (est.) | Logic moved |
|------|-----------|------------|-------------|
| `pwa/src/lib/domain/health-insights.ts` | `health-context.ts` (647) | ~300 | 6 insight generators (weight, HR, sleep, HRV, SpO2, steps correlation queries) |
| `pwa/src/lib/domain/streaks.ts` | `streaks.ts` (340) | ~150 | `countConsecutive()` date math + 6 completion-fetcher queries |
| `pwa/src/lib/domain/weekly-report.ts` | `weekly-report.ts` (329) | ~150 | `generateReport()` parallel aggregation + `isoWeek()` helper |
| `pwa/src/lib/domain/sleep-insights.ts` | `sleep.ts` (297) | ~120 | 5 insight correlations (melatonin, magnesium, steps, quality) |
| `pwa/src/lib/domain/spending-forecast.ts` | `spending.ts` (284) | ~80 | Month-to-date projection math, budget tracking |
| `pwa/src/lib/domain/pantry-smart.ts` | `pantry-smart.ts` (244) | ~100 | Ingredient fuzzy matching, expiry alerts, recipe suggestions |
| `pwa/src/lib/domain/meals.ts` | `meals.ts` (243) | ~80 | Pantry deduction on cook (sequential queries, best-effort) |
| `pwa/src/lib/domain/habits.ts` | `habits.ts` (190) | ~40 | Streak increment upsert logic |

**Total new domain code: ~1,020 lines** (down from ~2,574 lines in Express because we drop all HTTP boilerplate, error response formatting, and CORS handling).

Each helper takes `query` as a parameter (dependency injection) so they're testable without WASM.

---

## Phase 3: Strip Express to Webhook + Calendar Only

### Keep (2 routes, ~360 lines):
- `src/api/routes/health-webhook.ts` (323 LOC) -- receives Health Connect data from phone, needs server-side Node.js
- `src/api/routes/calendar.ts` (36 LOC) -- calls Google Calendar API via googleapis, needs server-side OAuth

### Delete (26 route files + 26 test files):
All other files in `src/api/routes/` -- both implementation and test files.

### Simplify:
- `src/api/routes/index.ts` -- mount only health-webhook + calendar
- `src/api/server.ts` -- strip unused middleware, keep CORS + rate limiting for webhook

### Update PWA:
- `api.calendar.today()` and `api.calendar.week()` keep using `fetchApi()` (still go through Express)
- Everything else uses `query()` from `db.ts`
- Delete `fetchSafe` helper once unused

---

## Phase 4: Cleanup

- **Service worker** (`pwa/src/service-worker.ts`): Remove `/api` network-first caching (lines 66-77). Add cache-first strategy for `.wasm` binary files.
- **MotherDuck views** (optional): Create views like `v_daily_calories`, `v_streak_completions` for commonly-used aggregations -- usable by both PWA and Discord bot.
- **Tests**: Add vitest tests for the domain helper modules (~500 lines). These replace ~26,000 lines of Express route tests.
- **Deploy workflow**: PWA-only changes no longer need Express restart.

---

## Final File Structure

```
pwa/src/lib/
  db.ts                          # NEW: WASM connection singleton (~80 lines)
  api.ts                         # REWRITTEN: SQL queries, same interface (~500 lines)
  domain/
    health-insights.ts           # NEW: 6 insight generators (~300 lines)
    streaks.ts                   # NEW: consecutive day counting (~150 lines)
    weekly-report.ts             # NEW: report aggregation (~150 lines)
    sleep-insights.ts            # NEW: sleep correlations (~120 lines)
    spending-forecast.ts         # NEW: projection math (~80 lines)
    pantry-smart.ts              # NEW: ingredient matching (~100 lines)
    meals.ts                     # NEW: pantry deduction (~80 lines)
    habits.ts                    # NEW: streak upsert (~40 lines)

src/api/
  server.ts                      # SLIMMED: webhook + calendar only
  db.ts                          # KEPT: for health-webhook
  routes/
    health-webhook.ts            # KEPT: receives phone data
    calendar.ts                  # KEPT: Google Calendar API
    index.ts                     # SLIMMED: 2 routes
```

## Line Count Impact

| Area | Before | After | Delta |
|------|--------|-------|-------|
| Express API routes | ~12,200 | ~400 | **-11,800** |
| Express API tests | ~26,600 | ~0 | **-26,600** |
| PWA lib (api.ts + db.ts + domain/) | ~768 | ~1,600 | +832 |
| Domain helper tests | 0 | ~500 | +500 |
| **Total** | **~39,568** | **~2,500** | **-37,068** |

Svelte pages (~15,500 lines) and NanoClaw core (~10,600 lines) are completely untouched.

## Verification

After each phase:
1. Open PWA on phone/browser, navigate every page, verify data loads
2. Test write operations: log a calorie entry, mark supplement taken, add a pantry item
3. Verify health webhook still receives data from phone (POST to /api/health-webhook)
4. Verify calendar page still loads events
5. Run `npm run build` in pwa/ -- must succeed
6. Check service worker: hard-refresh PWA, verify offline fallback still works
