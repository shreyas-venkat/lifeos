# SPEC.md — Phase 1: Foundation + Email + Discord

> LifeOS Phase 1 — the backbone that all future phases build on.

---

## Feature Name

LifeOS Phase 1 — NanoClaw deployment with Discord interface, Gmail email management, Google Calendar, and reminders system.

---

## Goal

Get LifeOS alive on Discord, autonomously managing Gmail (categorize, delete spam, alert on important), reading/writing Google Calendar, and handling user reminders. This is the foundation all future phases build on.

---

## Scope

### In Scope
- NanoClaw setup with Docker container runtime
- Discord channel: DM (main group) + server channels (#email-digest, #meals, #health, #activity-log, #reminders)
- Gmail channel: scan every 15 min, categorize into buckets, auto-delete spam/promotions, alert important via Discord DM
- MotherDuck schemas for emails, preferences, calendar_events, reminders
- Google Calendar read/write via Google Calendar API
- Morning briefing (6:00 AM MT weekdays) — schedule, emails, reminders
- Reminder system — set via DM, recurring supported, stored in MotherDuck
- 7-day soft-delete log for email deletions (safety)
- Daily email digest to #email-digest channel

### Out of Scope
- Meal planning, pantry, health, supplements (Phase 2-3)
- PWA (Phase 4)
- Obsidian, smart home (Phase 5)
- Outlook integration (deferred)
- SMS/text notifications (later)

---

## Inputs & Outputs

| | Description |
|---|---|
| **Input** | Gmail emails, Discord DM commands, Google Calendar events |
| **Output** | Email categorization/deletion, Discord alerts, calendar events, reminder notifications |

---

## Implementation Plan

### Step 0: GitHub Actions deploy workflow
Create `.github/workflows/deploy.yml` that:
1. Triggers on push to `feat/lifeos-init` branch (or any configured deploy branch)
2. SSHs into the VPS using repo secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
3. Clones/pulls the repo on the VPS
4. Writes `.env` on the VPS from repo secrets:
   - `ASSISTANT_NAME=LifeOS`
   - `ANTHROPIC_API_KEY` from `${{ secrets.ANTHROPIC_API_KEY }}`
   - `DISCORD_BOT_TOKEN` from `${{ secrets.DISCORD_TOKEN }}`
   - `DISCORD_OWNER_ID` from `${{ secrets.DISCORD_OWNER_ID }}`
   - `GITHUB_TOKEN` from `${{ secrets.GH_TOKEN }}`
   - `GOOGLE_CLIENT_ID` from `${{ secrets.GMAIL_CLIENT_ID }}`
   - `GOOGLE_CLIENT_SECRET` from `${{ secrets.GMAIL_CLIENT_SECRET }}`
   - `GOOGLE_REFRESH_TOKEN` from `${{ secrets.GMAIL_REFRESH_TOKEN }}`
   - `GOOGLE_CALENDAR_REFRESH_TOKEN` from `${{ secrets.GOOGLE_CALENDAR_REFRESH_TOKEN }}`
   - `MOTHERDUCK_TOKEN` from `${{ secrets.MOTHERDUCK_TOKEN }}`
   - `TZ=America/Edmonton`
5. Installs system deps if missing (Docker, Node.js 20, nginx)
6. Runs `npm install`
7. Builds container image: `./container/build.sh`
8. Configures nginx + SSL (certbot) if not already done
9. Restarts the NanoClaw service

**GitHub Secrets required** (already exist in the repo):
| Secret Name | Used As |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `DISCORD_TOKEN` | Discord bot token |
| `DISCORD_OWNER_ID` | Discord owner user ID |
| `DISCORD_TOKEN_STAGING` | Staging bot token (for testing) |
| `GH_TOKEN` | GitHub personal access token |
| `GMAIL_CLIENT_ID` | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Gmail OAuth refresh token |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | Google Calendar refresh token |
| `MOTHERDUCK_TOKEN` | MotherDuck cloud DuckDB token |
| `VPS_HOST` | VPS IP/hostname |
| `VPS_USER` | VPS SSH username |
| `VPS_SSH_KEY` | VPS SSH private key |
| `VPS_API_SECRET` | VPS API secret (if needed) |
| `REPO_DIR` | Repo directory on VPS |

### Step 1: NanoClaw core setup (on VPS, via deploy workflow)
1. Install Node.js 20+ dependencies: `npm install`
2. Build the Docker container image: `./container/build.sh`
3. Initialize SQLite database (auto-created by `src/db.ts` on first run)
4. Set timezone to `America/Edmonton` in config

### Step 2: Discord channel integration
1. Use the built-in `/add-discord` skill in `.claude/skills/add-discord/`
2. The Discord channel implements the `Channel` interface from `src/types.ts`:
   - `connect()` — connects discord.js client with intents: Guilds, GuildMessages, MessageContent, DirectMessages
   - `sendMessage(jid, text)` — sends to channel, handles 2000-char limit splitting
   - `isConnected()` / `ownsJid(jid)` — JID format: `dc:{channelId}`
   - `setTyping(jid, isTyping)` — typing indicators
3. Register via `registerChannel('discord', discordFactory)` in `src/channels/index.ts`
4. Factory returns `null` if `DISCORD_BOT_TOKEN` not in env (graceful skip)
5. Create Discord server with channels, get channel IDs
6. Register groups in NanoClaw's `registered_groups` table:
   - Main DM group: `jid=dc:{dm_channel_id}`, `is_main=true`, `requires_trigger=false`, `folder=main`
   - Each server channel: `jid=dc:{channel_id}`, `is_main=false`, `requires_trigger=true`, `trigger_pattern=@LifeOS`
7. Create `groups/main/CLAUDE.md` with LifeOS personality and instructions (see Step 9)

### Step 3: Gmail channel integration
1. Use NanoClaw's built-in `/add-gmail` skill which uses `@gongrzhe/server-gmail-autoauth-mcp`
2. Run one-time OAuth: `npx @gongrzhe/server-gmail-autoauth-mcp auth`
3. Credentials stored at `~/.gmail-mcp/`
4. Gmail operates in **dual mode**:
   - **Tool mode**: Agent can read/send/search email from any channel
   - **Channel mode**: Listens to inbox autonomously
5. Configure to filter Primary inbox only (skip Promotions, Social, Updates, Forums tabs)
6. Mount Gmail MCP server in container via OneCLI Agent Vault

### Step 4: Email categorization logic
1. Create scheduled task via IPC (every 15 min, cron: `*/15 * * * *`):
   ```json
   {
     "command": "schedule_task",
     "schedule_type": "cron",
     "schedule_value": "*/15 * * * *",
     "group_folder": "main",
     "chat_jid": "dc:{email_digest_channel_id}",
     "context_mode": "group",
     "prompt": "Check Gmail inbox for new emails. For each email: categorize it, take action, and log to MotherDuck."
   }
   ```
2. The agent (running in container) uses Gmail MCP tools to:
   - List unread emails
   - For each email, classify into bucket:
     - `actionable` — rent, appointments, action needed
     - `transactions` — orders, receipts, shipping
     - `bank` — RBC notifications
     - `life` — personal, social
     - `github` — GitHub Actions, PRs
     - `spam_promotions` — auto-trash (Gmail trash, NOT permanent delete)
     - `newsletters` — auto-archive or trash
   - Log each action to MotherDuck `lifeos.emails` table
   - If `actionable` or `bank`: send Discord DM alert to main group
3. Daily digest (cron: `0 20 * * *` = 8 PM MT): post summary to `#email-digest`

### Step 5: MotherDuck schemas
Connect via DuckDB client (`duckdb` npm package or MotherDuck MCP server).

```sql
CREATE SCHEMA IF NOT EXISTS lifeos;

CREATE TABLE IF NOT EXISTS lifeos.emails (
    id VARCHAR PRIMARY KEY,
    provider VARCHAR NOT NULL,
    message_id VARCHAR,
    sender VARCHAR NOT NULL,
    sender_name VARCHAR,
    subject VARCHAR,
    category VARCHAR NOT NULL,
    action_taken VARCHAR NOT NULL,
    importance VARCHAR DEFAULT 'normal',
    snippet TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.preferences (
    key VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    skill VARCHAR NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (key, skill)
);

CREATE TABLE IF NOT EXISTS lifeos.calendar_events (
    id VARCHAR PRIMARY KEY,
    google_event_id VARCHAR,
    title VARCHAR NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    location VARCHAR,
    event_type VARCHAR,
    source VARCHAR DEFAULT 'google',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.reminders (
    id VARCHAR PRIMARY KEY,
    message TEXT NOT NULL,
    due_at TIMESTAMP NOT NULL,
    recurring_cron VARCHAR,
    status VARCHAR DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.email_deletion_log (
    id VARCHAR PRIMARY KEY,
    email_id VARCHAR NOT NULL,
    sender VARCHAR,
    subject VARCHAR,
    reason VARCHAR NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recoverable_until TIMESTAMP
);
```

### Step 6: Google Calendar integration
1. Use Google Calendar API via `googleapis` npm package (add to container deps)
2. Implement as agent capability described in `groups/main/CLAUDE.md`:
   - Read today's events
   - Create new events
   - Check availability for a time slot
3. Credentials via OneCLI Agent Vault (Google OAuth refresh token)
4. Calendar syncs to Samsung Calendar automatically (Google Calendar -> Samsung)

### Step 7: Morning briefing
Schedule via IPC:
```json
{
  "command": "schedule_task",
  "schedule_type": "cron",
  "schedule_value": "0 6 * * 1-5",
  "group_folder": "main",
  "context_mode": "group",
  "prompt": "Good morning briefing. Check: 1) Today's Google Calendar events, 2) Any important emails since last evening, 3) Reminders due today. Format as a concise morning briefing and send to Discord DM."
}
```

### Step 8: Reminders system
1. User messages bot in DM: "remind me to pay rent on the 1st every month"
2. Agent parses intent, writes to MotherDuck `lifeos.reminders`:
   - `message`: "Pay rent"
   - `due_at`: next 1st of month
   - `recurring_cron`: "0 9 1 * *"
3. Scheduled task (cron: `*/5 * * * *`) checks for due reminders:
   ```
   prompt: "Check lifeos.reminders for any reminders where due_at <= now and status = 'active'. For each, send a Discord DM reminder and update status. For recurring, calculate next due_at from recurring_cron."
   ```
4. Optimization: use `script` field on scheduled task to only wake agent if reminders are due:
   ```bash
   #!/bin/bash
   RESULT=$(duckdb md: "SELECT count(*) as c FROM lifeos.reminders WHERE due_at <= now() AND status = 'active'" -json)
   COUNT=$(echo "$RESULT" | jq '.[0].c')
   if [ "$COUNT" -gt 0 ]; then
     echo '{"wakeAgent": true, "data": {"dueCount": '$COUNT'}}'
   else
     echo '{"wakeAgent": false}'
   fi
   ```

### Step 9: groups/main/CLAUDE.md (LifeOS personality)
Write the main group's CLAUDE.md with:

```markdown
# LifeOS — Personal Life Assistant

You are LifeOS, Shrey's personal life management assistant. You run 24/7 and proactively manage his daily life.

## Personality
- Talk like a helpful friend, not a corporate assistant
- Be concise — no filler, no "Sure!", no trailing summaries
- Proactive: do things without being asked when you know the routine
- When uncertain about something destructive (spending money, deleting non-spam), ask first

## Capabilities
- **Email**: Read, categorize, delete, and alert on Gmail via MCP tools
- **Calendar**: Read/write Google Calendar events
- **Reminders**: Set, track, and fire reminders stored in MotherDuck
- **MotherDuck**: Query and write to lifeos.* tables for persistent data
- **Web**: Browse the web for information when needed
- **Files**: Read/write files in your group folder for notes and state

## Shrey's Context
- Location: Calgary, AB (Mountain Time — America/Edmonton)
- Work: Tue/Thu/Fri in-office, Mon/Wed WFH
- Wake: 6-7 AM weekdays
- Cooking: Every evening, makes dinner + next-day lunch (2 portions)
- Likes cooking early to have free evening time for games/shows/reading
- Flexible with plans — sometimes eats out, that's fine
- Doesn't mind being bothered by notifications for most things
- Gym: wants to get back into it, gentle nudges welcome

## Email Rules
- **Auto-trash**: spam, promotions, LinkedIn noise, "please review" nag emails, newsletters (unless user subscribed intentionally)
- **Alert immediately**: rent reminders, orders/shipping, anything requiring action, bank alerts
- **Categorize all**: actionable, transactions, bank, life, github, and create new buckets as needed
- **Safety**: log all deletions to lifeos.email_deletion_log with 7-day recovery window
- **Digest**: post daily summary to #email-digest at 8 PM MT

## Reminder Rules
- Parse natural language: "remind me to X on Y" or "every Z"
- Store in lifeos.reminders with proper cron for recurring
- Fire via Discord DM at the scheduled time
- Support snooze ("remind me again in 1 hour")

## Morning Briefing (6 AM MT, weekdays)
Send a Discord DM with:
1. Today's calendar events
2. Important overnight emails (if any)
3. Reminders due today
4. If Tue/Thu/Fri: "Don't forget to pack lunch — [yesterday's dinner]" (Phase 2)

## Channel Formatting
- Discord: standard markdown
- Keep messages under 1900 chars (Discord limit is 2000, leave buffer)
- Use embeds sparingly — plain text is fine for most things
```

---

## Tests Required

- [ ] NanoClaw starts without errors (`npm start` or service)
- [ ] SQLite database initializes with correct schema (chats, messages, scheduled_tasks, etc.)
- [ ] Discord bot connects and responds to DM
- [ ] Discord bot posts to each server channel (#email-digest, #meals, #health, #activity-log, #reminders)
- [ ] Gmail OAuth credentials work — can list inbox emails
- [ ] Email scan scheduled task fires every 15 minutes
- [ ] Email categorization correctly classifies a test email into the right bucket
- [ ] Spam/promotion emails are trashed (not permanently deleted)
- [ ] Trashed emails logged to lifeos.email_deletion_log with 7-day window
- [ ] Important email triggers Discord DM alert within 15 minutes
- [ ] Daily email digest posts to #email-digest at 8 PM MT
- [ ] Google Calendar: can read today's events
- [ ] Google Calendar: can create a new event via Discord DM command
- [ ] Morning briefing fires at 6 AM MT on weekdays (test with manual trigger first)
- [ ] Reminder: "remind me to test at 5pm" -> fires at 5 PM MT
- [ ] Reminder: "remind me to X every Monday" -> recurring, fires next Monday
- [ ] Reminder snooze works
- [ ] MotherDuck lifeos.emails table populated after email scan
- [ ] MotherDuck lifeos.reminders table populated after setting reminder
- [ ] Container starts and stops cleanly (no orphaned containers)
- [ ] All scheduled tasks visible in SQLite scheduled_tasks table
- [ ] Bot handles errors gracefully (no crashes on malformed input)

---

## Dependencies / Packages

Already in NanoClaw:
- `better-sqlite3` — SQLite for message queue, groups, tasks
- `cron-parser` — scheduled task cron parsing
- `@onecli-sh/sdk` — credential injection via OneCLI Agent Vault

Container image (`node:22-slim`) already includes:
- `@anthropic-ai/claude-code` — Claude Agent SDK
- Chromium — browser automation

Need to add/verify:
- `discord.js` — Discord channel (comes from `/add-discord` skill)
- `duckdb` — MotherDuck connection from within container
- `googleapis` — Google Calendar API
- `@gongrzhe/server-gmail-autoauth-mcp` — Gmail MCP (mounted as MCP server, not installed in container)

---

## Open Questions

None — all clarified in planning conversation.

---

## Definition of Done

- [ ] All implementation steps completed
- [ ] All tests listed above written and passing
- [ ] Full test suite exits 0
- [ ] Linters pass (eslint / tsc)
- [ ] No dead code, no debug statements
- [ ] SPEC.md updated to reflect any deviations
- [ ] Bot runs stable for 24 hours without crashes
- [ ] Email scan has processed at least one full cycle
- [ ] At least one reminder has been set and fired successfully
