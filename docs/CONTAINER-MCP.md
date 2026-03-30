# Container MCP Servers — Known Issues & Requirements

This doc covers how MCP servers work inside NanoClaw containers, what breaks, and how to prevent regressions.

## Architecture

The container agent runs in Docker (`nanoclaw-agent:latest`). It has access to MCP servers configured in `container/agent-runner/src/index.ts`. These MCP servers run INSIDE the container as child processes.

### MCP Servers Currently Configured

| Server | Command | Purpose | Credentials |
|--------|---------|---------|-------------|
| `nanoclaw` | `node /app/dist/ipc-mcp.js` | Scheduler, send_message | Built-in via IPC |
| `gmail` | `gmail-mcp` | Read/send Gmail | `~/.gmail-mcp/` mount (file-based OAuth) |
| `motherduck` | `mcp-server-motherduck --read-write` | Query MotherDuck DB | `motherduck_token` env var |
| `google_calendar` | `node /app/mcp-servers/google-calendar.mjs` | Calendar CRUD | Google OAuth env vars |

## How Credentials Reach the Container

### Anthropic API Key
- Managed by OneCLI gateway — injected via HTTP proxy, never touches container env
- Container gets `ANTHROPIC_API_KEY=placeholder` + proxy settings

### Service Credentials (Google, MotherDuck)
- Passed via Docker `-e` flags from `src/container-runner.ts`
- The host process reads them from `process.env` (loaded from `.env` via systemd)
- Variables passed: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_REFRESH_TOKEN`, `MOTHERDUCK_TOKEN`

### Gmail OAuth
- File-based: `~/.gmail-mcp/credentials.json` + `gcp-oauth.keys.json`
- Mounted into container at `/home/node/.gmail-mcp/` (read-only)
- Created manually on VPS from `.env` Google OAuth values

## Known Issues & Fixes

### 1. MotherDuck "Ambiguous reference to schema lifeos"
**Symptom**: `Binder Error: Ambiguous reference to catalog or schema "lifeos"`
**Root cause**: MotherDuck had both a DATABASE named `lifeos` AND a SCHEMA named `lifeos` inside `my_db`. SQL like `SELECT FROM lifeos.table` was ambiguous.
**Fix**:
- `src/api/db.ts` runs `USE my_db` on connection
- Dropped the conflicting `lifeos` database: `DROP DATABASE IF EXISTS lifeos`
**Prevention**: The migration script (`scripts/motherduck/schemas/*.sql`) uses `CREATE SCHEMA IF NOT EXISTS lifeos` which can recreate the database. Always run migrations with `USE my_db` first. NEVER create a database named `lifeos`.

### 2. Container can't find npm packages (npx/uvx not available)
**Symptom**: MCP server fails to start, agent says tools aren't connected
**Root cause**: Container image is `node:22-slim` — has `node` but NOT `npx` or `uvx`
**Fix**: Pre-install MCP servers in `container/Dockerfile`:
- `npm install -g @gongrzhe/server-gmail-autoauth-mcp` → provides `gmail-mcp` binary
- `uv tool install mcp-server-motherduck` → provides `mcp-server-motherduck`, copied to `/usr/local/bin/`
- Google Calendar MCP has deps installed locally: `cd /app/mcp-servers && npm install googleapis @modelcontextprotocol/sdk zod`
**Prevention**: Any new MCP server must be installed in the Dockerfile, not rely on npx/uvx.

### 3. ESM imports can't find globally installed packages
**Symptom**: `ERR_MODULE_NOT_FOUND: Cannot find package 'googleapis'`
**Root cause**: Node.js ESM doesn't respect `NODE_PATH` for import resolution
**Fix**: Install dependencies locally where the MCP server lives (`/app/mcp-servers/node_modules/`)
**Prevention**: Never use `NODE_PATH` for ESM. Install deps alongside the script.

### 4. MCP server binary not accessible by container user
**Symptom**: MCP server not found or permission denied
**Root cause**: Container runs as `node` (uid 1000), but `uv tool install` puts binaries in `/root/.local/bin/`
**Fix**: Copy (not symlink) to `/usr/local/bin/` with `chmod 755`
**Prevention**: Always verify binaries are accessible as `node` user: `docker run --rm --entrypoint bash nanoclaw-agent:latest -c 'which <binary>'`

### 5. Gmail MCP needs TWO credential files
**Symptom**: `Error: OAuth keys file not found`
**Root cause**: `@gongrzhe/server-gmail-autoauth-mcp` needs both `credentials.json` (refresh token) AND `gcp-oauth.keys.json` (client ID/secret)
**Fix**: Create both files in `~/.gmail-mcp/` on VPS
**Prevention**: Check both files exist after deploy.

### 6. Service env vars not reaching container
**Symptom**: Agent says "can't connect to MotherDuck/Calendar"
**Root cause**: `src/container-runner.ts` must explicitly pass env vars via `-e` flags. OneCLI only handles Anthropic keys.
**Fix**: Added `serviceEnvVars` array in `buildContainerArgs()` that passes Google + MotherDuck tokens
**Prevention**: When adding a new service that needs credentials in the container, add the env var name to the `serviceEnvVars` array in `src/container-runner.ts`.

### 7. DuckDB BigInt serialization
**Symptom**: `Do not know how to serialize a BigInt`
**Root cause**: DuckDB `@duckdb/node-api` returns BigInt for numeric types, `JSON.stringify` can't handle them
**Fix**: `BigInt.prototype.toJSON` in `src/api/server.ts` + type conversion in `src/api/db.ts`
**Prevention**: Already globally fixed. Any new DuckDB queries will auto-convert.

### 8. DuckDB TIMESTAMP/DATE objects
**Symptom**: API returns `{"micros": 1234567890}` instead of ISO strings
**Root cause**: `@duckdb/node-api` returns timestamp as `{micros: bigint}` and date as `{days: number}`
**Fix**: Conversion in `src/api/db.ts` query helper
**Prevention**: Already globally fixed in the query helper.

### 9. Session files not writable by container
**Symptom**: "No conversation found with session ID" loop
**Root cause**: `data/sessions/` owned by root, container runs as node (uid 1000)
**Fix**: `chown -R 1000:1000 data/sessions/` + added to deploy workflow
**Prevention**: Deploy workflow includes `chown` step.

### 10. Stale sessions causing infinite retry loops
**Symptom**: Bot types then stops, repeats forever
**Root cause**: Session ID saved to SQLite even on error, next attempt resumes with invalid ID
**Fix**: Clear session on error in both `src/index.ts` (runAgent) AND `src/task-scheduler.ts` (runTask)
**Prevention**: Both error paths now clear sessions. The agent-runner also omits session ID from error responses for "No conversation found" errors.

## Testing MCP Servers

Before deploying, verify each MCP server works inside the container:

```bash
# Gmail
docker run --rm --entrypoint bash -v ~/.gmail-mcp:/home/node/.gmail-mcp:ro nanoclaw-agent:latest -c 'timeout 3 gmail-mcp 2>&1 || true'

# MotherDuck
docker run --rm --entrypoint bash -e MOTHERDUCK_TOKEN=$MOTHERDUCK_TOKEN nanoclaw-agent:latest -c 'timeout 3 mcp-server-motherduck --read-write 2>&1 || true'

# Google Calendar
docker run --rm --entrypoint bash -e GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID -e GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET -e GOOGLE_CALENDAR_REFRESH_TOKEN=$GOOGLE_CALENDAR_REFRESH_TOKEN nanoclaw-agent:latest -c 'timeout 3 node /app/mcp-servers/google-calendar.mjs 2>&1 || true'
```

No error output = working. Any error = needs fixing before deploy.

## Adding a New MCP Server

1. Install it in `container/Dockerfile` (globally or locally)
2. Verify binary is accessible as `node` user
3. Add to `container/agent-runner/src/index.ts` in the `mcpServers` config
4. Add tool pattern to `allowedTools` (e.g., `'mcp__newserver__*'`)
5. If it needs credentials, add env var to `serviceEnvVars` in `src/container-runner.ts`
6. Rebuild container: `./container/build.sh`
7. Clear agent-runner cache: `rm -rf data/sessions/*/agent-runner-src`
8. Test with the docker commands above
9. Restart NanoClaw
