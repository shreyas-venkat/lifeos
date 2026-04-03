# BUILD.md — Orchestrator
Last updated: 2026-04-02

## Current Task
Migrate PWA from Express API proxy to direct MotherDuck WASM queries. Full plan at `docs/MIGRATION-WASM.md`.

**Constraint:** Do NOT delete database rows during testing. Do NOT delete test files.

## Decomposition
| Repo | Task | Branch | PR | Status |
|------|------|--------|-----|--------|
| lifeos | WASM client foundation (db.ts, package, nginx config) | feat/wasm-client | #49 | merged |
| lifeos | Rewrite api.ts from fetch to SQL + domain helpers | feat/wasm-api-rewrite | #50 | merged |
| lifeos | Slim Express to webhook+calendar, update service worker | feat/wasm-express-cleanup | #51 | merged |

## Agent Status
| Agent | Repo | Branch | PR | Status |
|-------|------|--------|-----|--------|
| wasm-foundation | lifeos | feat/wasm-client | #49 | merged |
| api-rewrite | lifeos | feat/wasm-api-rewrite | #50 | merged |
| express-cleanup | lifeos | feat/wasm-express-cleanup | #51 | merged |

## Review Log
- 2026-04-02 Reviewed #49 (wasm-client) — merged, clean foundation (db.ts, nginx, vite config)
- 2026-04-02 Reviewed #50 (api-rewrite) — merged, full api.ts rewrite + 8 domain helpers, CI pass
- 2026-04-02 Reviewed #51 (express-cleanup) — merged, stripped 25 routes from index.ts, WASM SW caching
