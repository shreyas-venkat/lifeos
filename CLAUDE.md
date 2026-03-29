@GUARDRAILS.md

# NanoClaw — LifeOS

Personal Claude assistant for autonomous life management. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/` | Skills loaded inside agent containers (browser, status, formatting) |

## Secrets / Credentials / Proxy (OneCLI)

API keys, secret keys, OAuth tokens, and auth credentials are managed by the OneCLI gateway — which handles secret injection into containers at request time, so no keys or tokens are ever passed to containers directly. Run `onecli --help`.

## Skills

Four types of skills exist in NanoClaw. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full taxonomy and guidelines.

- **Feature skills** — merge a `skill/*` branch to add capabilities (e.g. `/add-telegram`, `/add-slack`)
- **Utility skills** — ship code files alongside SKILL.md (e.g. `/claw`)
- **Operational skills** — instruction-only workflows, always on `main` (e.g. `/setup`, `/debug`)
- **Container skills** — loaded inside agent containers at runtime (`container/skills/`)

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/init-onecli` | Install OneCLI Agent Vault and migrate `.env` credentials to it |

## MCP Servers

| Server | Purpose | Key env vars |
|--------|---------|-------------|
| `filesystem` | Expanded file access beyond the project root | -- |
| `github` | Issues, PRs, reviews, releases, repo management | `GITHUB_TOKEN` |
| `gmail` | Read, compose, reply, and search email | file-based OAuth (one-time setup) |
| `motherduck` | Run SQL against MotherDuck (cloud DuckDB) | `MOTHERDUCK_TOKEN` |

## Development

Run commands directly -- don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

## Session Workflow

1. **Start with a spec.** Create or read `SPEC.md` before writing any code. The `check-spec` hook blocks all file writes until it exists and is filled out.
2. **Never work on `main` directly.** The `block-main` hook blocks edits and pushes on main. Create a feature branch.
3. **Tests run after every edit.** The `run-tests` hook fires after every file change. Fix failures before moving on.
4. **Done means the Stop hook passes.** Full test suite green, no debug markers, every source file has a test file.

## Conventions

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Branch names follow `type/short-description` (e.g. `feat/add-user-auth`).
