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

- [x] NanoClaw starts without errors (`npm start` or service)
- [x] SQLite database initializes with correct schema (chats, messages, scheduled_tasks, etc.)
- [x] Discord bot connects and responds to DM
- [x] Discord bot posts to each server channel (#email-digest, #meals, #health, #activity-log, #reminders)
- [x] Gmail OAuth credentials work — can list inbox emails
- [x] Email scan scheduled task fires every 15 minutes
- [ ] Email categorization correctly classifies a test email into the right bucket
- [x] Spam/promotion emails are trashed (not permanently deleted)
- [ ] Trashed emails logged to lifeos.email_deletion_log with 7-day window
- [ ] Important email triggers Discord DM alert within 15 minutes
- [x] Daily email digest posts to #email-digest at 8 PM MT
- [x] Google Calendar: can read today's events
- [ ] Google Calendar: can create a new event via Discord DM command
- [ ] Morning briefing fires at 6 AM MT on weekdays (test with manual trigger first)
- [x] Reminder: "remind me to test at 5pm" -> fires at 5 PM MT
- [ ] Reminder: "remind me to X every Monday" -> recurring, fires next Monday
- [ ] Reminder snooze works
- [ ] MotherDuck lifeos.emails table populated after email scan
- [ ] MotherDuck lifeos.reminders table populated after setting reminder
- [x] Container starts and stops cleanly (no orphaned containers)
- [x] All scheduled tasks visible in SQLite scheduled_tasks table
- [x] Bot handles errors gracefully (no crashes on malformed input)

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

# Phase 2: Meal Planning + Pantry + Calories + Grocery

## Goal
Weekly meal plans, recipe management, pantry tracking with photo analysis, calorie logging (auto from recipes + manual for eating out), and Calgary Co-op grocery cart automation.

## Implementation Plan

### Step 10: MotherDuck schemas for Phase 2
```sql
CREATE TABLE IF NOT EXISTS lifeos.recipes (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    source_url VARCHAR,
    ingredients JSON NOT NULL,
    instructions TEXT,
    prep_time_min INTEGER,
    cook_time_min INTEGER,
    servings INTEGER DEFAULT 2,
    calories_per_serving DOUBLE,
    macros JSON,
    rating DOUBLE,
    times_cooked INTEGER DEFAULT 0,
    tags VARCHAR[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.meal_plans (
    id VARCHAR PRIMARY KEY,
    week_start DATE NOT NULL,
    day_of_week INTEGER NOT NULL,
    meal_type VARCHAR NOT NULL,
    recipe_id VARCHAR REFERENCES lifeos.recipes(id),
    servings INTEGER DEFAULT 2,
    notes TEXT,
    status VARCHAR DEFAULT 'planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.pantry (
    id VARCHAR PRIMARY KEY,
    item VARCHAR NOT NULL,
    quantity DOUBLE,
    unit VARCHAR,
    category VARCHAR,
    expiry_date DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.dietary_preferences (
    id VARCHAR PRIMARY KEY,
    pref_type VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS lifeos.calorie_log (
    id VARCHAR PRIMARY KEY,
    log_date DATE NOT NULL,
    meal_type VARCHAR NOT NULL,
    description TEXT,
    source VARCHAR NOT NULL,
    calories DOUBLE,
    protein_g DOUBLE,
    carbs_g DOUBLE,
    fat_g DOUBLE,
    fiber_g DOUBLE,
    recipe_id VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.grocery_lists (
    id VARCHAR PRIMARY KEY,
    week_start DATE NOT NULL,
    items JSON NOT NULL,
    status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Step 11: Meal planning skill
1. Scheduled task (Saturday 9 AM MT, cron: `0 9 * * 6`):
   - Read dietary preferences from `lifeos.dietary_preferences`
   - Read current pantry from `lifeos.pantry`
   - Read previous recipe ratings from `lifeos.recipes`
   - Scrape 7 recipes from sites (AllRecipes, Budget Bytes, etc.) that match preferences
   - Account for user's pattern: cook once evening -> dinner + next-day lunch (2 portions)
   - Office days (Tue/Thu/Fri) need packable lunches
   - Generate meal plan, insert into `lifeos.meal_plans`
   - Post plan to `#meals` channel + DM user for approval
   - User can reply: "swap Thursday for pasta", "mark Friday as eating out", "approved"
2. After cooking (bot asks ~7 PM nightly): "How was [recipe]? Rate 1-5"
   - Update `lifeos.recipes.rating` and `times_cooked`
   - Auto-log calories from recipe data
   - Auto-deduct ingredients from `lifeos.pantry`

### Step 12: Pantry management skill
1. Photo-based: user sends pantry/fridge photo via Discord DM or PWA
   - Claude vision analyzes image, identifies items
   - Updates `lifeos.pantry` table (add new items, update quantities)
2. Manual: user says "bought 2kg chicken and rice" -> parses and updates pantry
3. Expiry tracking: daily check (cron `0 8 * * *`), warn if items expiring within 3 days
4. Auto-deduct: when a meal plan status changes to "cooked", subtract recipe ingredients from pantry

### Step 13: Calorie tracking skill
1. Auto from recipes: when meal status = "cooked", log calories + macros from recipe data
   - Use USDA FoodData Central API for ingredient-level nutrition if recipe doesn't have it
2. Manual: user says "ate butter chicken and naan from XYZ restaurant"
   - Claude estimates calories + macros, logs to `lifeos.calorie_log`
3. Daily summary to `#health` channel at 9 PM: total calories, protein, carbs, fat
4. Weekly trend comparison against targets

### Step 14: Grocery automation skill
1. After meal plan approved: generate shopping list
   - meal plan ingredients - current pantry stock = shopping list
   - Store in `lifeos.grocery_lists`
2. Calgary Co-op cart (Playwright browser automation):
   - Navigate to `shoponline.calgarycoop.com`
   - Login with stored credentials
   - Search each item, select best match, add to cart with correct quantity
   - DM user: "Grocery cart ready: [item list]. Review and checkout at [link]"
3. Add "Grocery pickup/delivery" event to Google Calendar

## Phase 2 Tests
- [ ] Saturday meal plan generates with 7 dinners matching dietary preferences
- [ ] Recipes have nutritional data (calories, macros)
- [ ] Meal plan posted to #meals channel
- [ ] User can swap/skip meals via Discord DM
- [ ] Pantry photo analysis identifies common items correctly
- [ ] Pantry auto-deducts ingredients when meal is cooked
- [ ] Calorie auto-logs from recipe when meal is cooked
- [ ] Manual calorie entry for eating out produces reasonable estimates
- [ ] Grocery list = meal plan ingredients minus pantry
- [ ] Playwright successfully adds items to Calgary Co-op cart
- [ ] Grocery calendar event created
- [ ] Daily calorie summary posts to #health

---

# Phase 3: Health + Supplements + Fitness

## Goal
Health data pipeline from Health Connect Webhook, supplement management with AI-adjusted dosages, and fitness accountability nudges.

## Implementation Plan

### Step 15: MotherDuck schemas for Phase 3
```sql
CREATE TABLE IF NOT EXISTS lifeos.health_metrics (
    id VARCHAR PRIMARY KEY,
    metric_type VARCHAR NOT NULL,
    value DOUBLE NOT NULL,
    unit VARCHAR,
    recorded_at TIMESTAMP NOT NULL,
    source VARCHAR DEFAULT 'health_connect',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.supplements (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    default_dosage DOUBLE NOT NULL,
    unit VARCHAR NOT NULL,
    time_of_day VARCHAR NOT NULL,
    max_safe_dosage DOUBLE,
    active BOOLEAN DEFAULT TRUE,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS lifeos.supplement_log (
    id VARCHAR PRIMARY KEY,
    supplement_id VARCHAR NOT NULL,
    recommended_dosage DOUBLE,
    reason TEXT,
    taken BOOLEAN DEFAULT FALSE,
    log_date DATE NOT NULL,
    time_of_day VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.fitness_log (
    id VARCHAR PRIMARY KEY,
    log_date DATE NOT NULL,
    activity VARCHAR,
    duration_min INTEGER,
    steps INTEGER,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS lifeos.fitness_nudges (
    id VARCHAR PRIMARY KEY,
    nudge_date DATE NOT NULL,
    message TEXT NOT NULL,
    trigger_reason VARCHAR,
    acknowledged BOOLEAN DEFAULT FALSE
);
```

### Step 16: Health Connect webhook endpoint
1. Create Express/Fastify HTTP endpoint at `/api/health-webhook`
   - Accepts POST with JSON body from Health Connect Webhook Android app
   - Parses all 18 metric types: steps, heart_rate, hrv, blood_pressure, spo2, weight, sleep_duration, sleep_quality, respiratory_rate, body_temp, blood_glucose, etc.
   - Inserts raw data into `lifeos.health_metrics`
   - Endpoint secured with a simple API key header
2. Add to `api/routes/health-webhook.ts`
3. nginx already configured to proxy `/api/health-webhook` to port 3100

### Step 17: Supplement management skill
1. Initial setup: user provides supplement list via DM -> stored in `lifeos.supplements`
2. Daily evening recommendation (cron `0 21 * * *` for next morning):
   - Query today's health data from `lifeos.health_metrics`
   - Analyze: sleep quality, HRV, activity level, stress indicators
   - Adjust dosages within safe ranges (never exceed `max_safe_dosage`):
     - Bad sleep -> extra magnesium
     - Low HRV -> increase ashwagandha
     - Low activity -> skip pre-workout
   - DM: "Morning supplements for tomorrow: [list with dosages and brief reasoning]"
   - Log recommendations to `lifeos.supplement_log`
3. Morning recommendation (cron `0 6 * * *` for evening):
   - Same logic for evening supplements
4. Weekly suggestions: suggest new supplements or removal based on health trends
5. If health data is abnormal (very low/high HR, SpO2 < 90%, etc.): flag for medical attention, DO NOT adjust supplements

### Step 18: Fitness nudge skill
1. Step monitoring (daily cron `0 20 * * *`):
   - Query steps from `lifeos.health_metrics` for last 3 days
   - If avg < 5000/day -> friendly nudge via DM
2. Weight trend (weekly cron `0 9 * * 0`):
   - Query weight from health_metrics for last 2 weeks
   - If trending up -> gentle nudge about activity
3. Gym accountability:
   - User sets goal: "I want to go to gym 3x per week"
   - Store in `lifeos.preferences`
   - Track via exercise_sessions from Health Connect
   - Mid-week check: if behind pace -> "You've hit the gym once this week, want me to block off Thursday evening?"
4. All nudges: friendly tone, never aggressive
5. Log nudges to `lifeos.fitness_nudges`

### Step 19: Health dashboard data
Daily health summary to `#health` channel (cron `0 21 * * *`):
- Sleep: duration + quality
- Steps + active calories
- Resting HR, HRV, SpO2
- Weight + 7-day trend
- Calories + macros (from Phase 2)
- Supplements: recommended vs taken

## Phase 3 Tests
- [x] Health webhook endpoint accepts POST and stores data in MotherDuck
- [x] All 18 health metric types parsed correctly
- [ ] Supplement recommendations generate with reasoning
- [ ] Dosages never exceed max_safe_dosage
- [ ] Abnormal vitals trigger medical warning, not supplement adjustment
- [ ] Fitness nudges fire after 3+ days of low steps
- [ ] Weight trend calculation is accurate
- [ ] Gym goal tracking works
- [ ] Daily health summary posts to #health

---

# Phase 4: LifeOS PWA v2

## Goal
Modern, polished standalone PWA. Interactive node-graph dashboard. History views with 7/30/90 day toggles. Clean data visualization with proper charts. All API endpoints aligned with actual MotherDuck schema.

## Design System

### Color Palette
```
--bg-primary:    #0f0f14     (near-black background)
--bg-card:       #1a1a24     (card/surface)
--bg-elevated:   #242430     (elevated surfaces, modals)
--border:        #2a2a3a     (subtle borders)
--text-primary:  #e8e8ed     (main text)
--text-secondary:#8888a0     (labels, hints)
--accent:        #6366f1     (indigo — primary actions, active states)
--accent-glow:   #818cf820   (subtle glow on interactive elements)
--success:       #22c55e     (green — good values, taken)
--warning:       #f59e0b     (amber — expiring, moderate)
--danger:        #ef4444     (red — expired, critical)
```

### Typography
- Font: Inter (Google Fonts) or system -apple-system stack
- Headings: 600 weight, tracking -0.02em
- Body: 400 weight, 14-16px
- Numbers/stats: tabular-nums, monospace feel

### Components
- Cards: rounded-xl (16px), subtle border, no heavy shadows
- Buttons: rounded-lg, 36px height, ghost style by default
- Charts: smooth curves, gradient fills, no grid lines
- Progress rings: SVG circle with stroke-dasharray animation
- Transitions: 200ms ease-out on all interactive elements

---

## Step 20: API Server (rewrite)

### Existing infrastructure
- Express server at `src/api/server.ts`, starts on port 3100 with NanoClaw
- Routes mounted via `src/api/routes/index.ts` → `mountRoutes()`
- DB helper at `src/api/db.ts` using `@duckdb/node-api` → MotherDuck
- No auth on data routes (behind Tailscale), API key only on `/api/health-webhook`
- nginx proxies `/api` → `localhost:3100`, serves PWA at `/app`

### API endpoints to implement/fix

All responses follow format: `{ data: T }` for single items, `{ data: T[] }` for lists, with additional metadata fields as needed.

**Health endpoints** (`src/api/routes/health.ts`):

```
GET /api/health/today
  SQL: SELECT metric_type, value, unit, recorded_at
       FROM lifeos.health_metrics
       WHERE recorded_at >= CURRENT_DATE
       ORDER BY recorded_at DESC
  Response: { data: { metric_type: string, value: number, unit: string | null, recorded_at: string }[] }
  Notes: Returns raw metric array. PWA aggregates client-side (latest value per metric_type).

GET /api/health/history?days=7&metric=steps
  SQL: SELECT CAST(recorded_at AS DATE) AS date, metric_type, AVG(value) AS avg_value, MIN(value) AS min_value, MAX(value) AS max_value, COUNT(*) AS readings
       FROM lifeos.health_metrics
       WHERE recorded_at >= CURRENT_DATE - INTERVAL '{days}' DAY
       AND (metric_type = '{metric}' OR '{metric}' = 'all')
       GROUP BY CAST(recorded_at AS DATE), metric_type
       ORDER BY date ASC, metric_type
  Response: { data: { date: string, metric_type: string, avg_value: number, min_value: number, max_value: number, readings: number }[], days: number }
  Params: days (7|30|90, default 7), metric (steps|heart_rate|hrv|spo2|weight|sleep_duration|all, default all)
```

**Meals endpoints** (`src/api/routes/meals.ts`):

```
GET /api/meals/plan?week=current
  SQL: SELECT mp.id, mp.week_start, mp.day_of_week, mp.meal_type, mp.status, mp.notes, mp.servings,
              r.name AS recipe_name, r.calories_per_serving, r.prep_time_min, r.cook_time_min
       FROM lifeos.meal_plans mp
       LEFT JOIN lifeos.recipes r ON mp.recipe_id = r.id
       WHERE mp.week_start = date_trunc('week', CURRENT_DATE)
       ORDER BY mp.day_of_week, mp.meal_type
  Response: { data: MealPlanRecord[], week_start: string }

POST /api/meals/plan/:id/status
  Body: { status: 'cooked' | 'skipped' | 'ate_out' }
  SQL: UPDATE lifeos.meal_plans SET status = $1 WHERE id = $2
  Response: { success: true }

GET /api/meals/recipes?search=chicken&limit=20
  SQL: SELECT id, name, calories_per_serving, rating, times_cooked, prep_time_min, tags
       FROM lifeos.recipes
       WHERE ($1 IS NULL OR name ILIKE '%' || $1 || '%')
       ORDER BY rating DESC NULLS LAST, times_cooked DESC
       LIMIT $2
  Response: { data: RecipeSummary[] }

POST /api/meals/recipes/:id/rate
  Body: { rating: number } (1-5)
  SQL: UPDATE lifeos.recipes SET rating = $1 WHERE id = $2
  Response: { success: true }
```

**Calories endpoints** (`src/api/routes/calories.ts`):

```
GET /api/calories/today
  SQL: SELECT id, meal_type, description, source, calories, protein_g, carbs_g, fat_g, fiber_g, created_at
       FROM lifeos.calorie_log
       WHERE log_date = CURRENT_DATE
       ORDER BY created_at ASC
  Response: { data: CalorieEntry[], total: { calories: number, protein_g: number, carbs_g: number, fat_g: number } }

GET /api/calories/history?days=7
  SQL: SELECT log_date, SUM(calories) AS calories, SUM(protein_g) AS protein_g, SUM(carbs_g) AS carbs_g, SUM(fat_g) AS fat_g, COUNT(*) AS entries
       FROM lifeos.calorie_log
       WHERE log_date >= CURRENT_DATE - INTERVAL '{days}' DAY
       GROUP BY log_date
       ORDER BY log_date ASC
  Response: { data: DailyCalorieSummary[], days: number }
```

**Pantry endpoints** (`src/api/routes/pantry.ts`):

```
GET /api/pantry
  SQL: SELECT id, item, quantity, unit, category, expiry_date, updated_at
       FROM lifeos.pantry
       ORDER BY category, item ASC
  Response: { data: PantryItem[] }

POST /api/pantry/photo
  Body: { image: string } (base64, max 10MB)
  Response: { status: 'accepted', image_size: number }
```

**Supplements endpoints** (`src/api/routes/supplements.ts`):

```
GET /api/supplements/today
  SQL: SELECT s.id AS supplement_id, s.name, s.default_dosage, s.unit, s.time_of_day,
              sl.id AS log_id, sl.recommended_dosage, sl.reason, sl.taken, sl.log_date
       FROM lifeos.supplements s
       LEFT JOIN lifeos.supplement_log sl ON s.id = sl.supplement_id AND sl.log_date = CURRENT_DATE
       WHERE s.active = true
       ORDER BY s.time_of_day ASC
  Response: { data: SupplementWithStatus[] }
  Notes: Joins master supplement list with today's log. If no log entry exists, taken=false.

POST /api/supplements/:id/taken
  SQL: INSERT INTO lifeos.supplement_log (id, supplement_id, taken, log_date, time_of_day)
       VALUES ($1, $2, true, CURRENT_DATE, $3)
       ON CONFLICT (id) DO UPDATE SET taken = true
  Response: { success: true }
  Notes: Use parameterized queries. Generate UUID for id.
```

**Preferences endpoints** (`src/api/routes/preferences.ts`):

```
GET /api/preferences
  SQL: SELECT key, value, skill, updated_at FROM lifeos.preferences ORDER BY skill, key
  Response: { data: { key: string, value: string, skill: string }[] }

PUT /api/preferences
  Body: { preferences: { key: string, value: string, skill?: string }[] }
  SQL: INSERT INTO lifeos.preferences (key, value, skill) VALUES ($1, $2, $3)
       ON CONFLICT (key, skill) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
  Response: { success: true, updated: number }
```

**Health webhook** (`src/api/routes/health-webhook.ts`):

```
POST /api/health-webhook
  Auth: x-api-key header required (VPS_API_SECRET)
  Body: Health Connect app format { steps: [{count, start_time, end_time}], heart_rate: [{bpm, time}], ... }
  Action: Transform to normalized metrics AND INSERT INTO lifeos.health_metrics
  SQL: INSERT INTO lifeos.health_metrics (id, metric_type, value, unit, recorded_at, source, created_at)
       VALUES ($1, $2, $3, $4, $5, 'health_connect', CURRENT_TIMESTAMP)
  Response: { accepted: number, rejected: number }
  IMPORTANT: Currently accepts metrics but does NOT write to MotherDuck. Must add INSERT.
```

### Critical API fixes
1. **Health webhook must write to DB** — currently logs and discards
2. **SQL injection in supplements** — use parameterized queries everywhere
3. **Supplements must JOIN** — query both `supplements` and `supplement_log` tables
4. **Calories needs totals** — compute sum of macros server-side
5. **New `/history` endpoints** — for 7/30/90 day chart data

---

## Step 21: PWA Frontend (complete rewrite)

### Stack
- SvelteKit 5 with static adapter (keep existing setup)
- D3.js for the dashboard node graph
- Chart.js for line/bar charts on detail pages
- Inter font from Google Fonts
- CSS custom properties for theming (no component library — hand-crafted)
- Existing: `pwa/` directory, base path `/app`, manifest.json

### TypeScript interfaces (`pwa/src/lib/api.ts`)

These MUST match the actual API responses exactly:

```typescript
// Health
interface HealthMetric {
  metric_type: string;
  value: number;
  unit: string | null;
  recorded_at: string;
}

interface HealthHistoryPoint {
  date: string;
  metric_type: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  readings: number;
}

// Meals
interface MealPlanRecord {
  id: string;
  week_start: string;
  day_of_week: number;
  meal_type: string;
  status: string;
  notes: string | null;
  servings: number;
  recipe_name: string | null;
  calories_per_serving: number | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
}

interface RecipeSummary {
  id: string;
  name: string;
  calories_per_serving: number | null;
  rating: number | null;
  times_cooked: number;
  prep_time_min: number | null;
  tags: string[] | null;
}

// Calories
interface CalorieEntry {
  id: string;
  meal_type: string;
  description: string | null;
  source: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  created_at: string;
}

interface DailyCalorieSummary {
  log_date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  entries: number;
}

// Pantry
interface PantryItem {
  id: string;
  item: string;           // NOT "name" — column is "item"
  quantity: number | null;
  unit: string | null;
  category: string | null;
  expiry_date: string | null;  // NOT "expiry" — column is "expiry_date"
  updated_at: string;
}

// Supplements
interface SupplementWithStatus {
  supplement_id: string;
  name: string;
  default_dosage: number;
  unit: string;
  time_of_day: string;
  log_id: string | null;
  recommended_dosage: number | null;
  reason: string | null;
  taken: boolean;
  log_date: string | null;
}

// Preferences
interface PreferenceRow {
  key: string;
  value: string;
  skill: string;
}
```

### Pages

#### `/app` — Dashboard (Living Node Graph)

Full-viewport interactive force-directed graph using D3.js. This is the centerpiece of the app — it must feel alive, organic, and modern.

**Nodes:**
- **Center node**: Larger (100px), filled with radial gradient (`--accent` → transparent`), "LifeOS" text + current date below. Subtle breathing animation (scale 1.0 → 1.03 → 1.0 over 3s, infinite).
- **4 satellite nodes**: Health (red), Meals (amber), Pantry (green), Supplements (purple). Each 80px diameter.
- All nodes are **filled circles** with:
  - Radial gradient fill (node color center → darker edge)
  - Soft inner glow (box-shadow or SVG filter with `feGaussianBlur`)
  - SVG icon inside (heart for health, utensils for meals, basket for pantry, pill for supplements)
  - Stat text below icon (e.g., "7,200 steps")
  - Label text below the circle
- **No data state**: Node fill becomes muted (`--bg-elevated`), stat shows "—", icon dimmed to 30% opacity

**Physics & Animation:**
- D3 force simulation runs CONTINUOUSLY — never stops. Use `simulation.alphaTarget(0.02).restart()` to keep gentle motion forever.
- Forces: center gravity (strength 0.01), collision (radius + padding), link force (distance 180), gentle random jitter force that nudges nodes slightly every few seconds
- Nodes drift slowly at all times — the graph should never be static
- Each node has a subtle **breathing pulse**: CSS animation on the glow/shadow, `scale(1.0)` → `scale(1.02)` → `scale(1.0)` with staggered delays per node
- Draggable: click and drag to reposition nodes. On release, node rejoins physics.

**Edges:**
- Curved SVG paths (use `d3.linkHorizontal` or quadratic bezier) connecting each satellite to center
- Stroke: subtle gradient from center node color to satellite node color, opacity 0.3
- **Pulse animation**: Small glowing dot (SVG circle, 4px) travels along each edge path continuously using `<animateMotion>` with `dur="3s"` and staggered `begin` per edge. Creates a "data flowing" effect.

**Zoom & Pan:**
- `d3.zoom()` behavior attached to the SVG
- Scroll wheel zooms on desktop, pinch-to-zoom on mobile
- Pan by dragging empty space
- Zoom range: 0.3x to 3x
- Double-tap/click on empty space resets zoom to default

**Date Picker:**
- Top-right corner: minimal date picker showing "Today" by default
- Click to open: shows a small calendar or left/right arrows to navigate days
- Changing date re-fetches all summary data for that date (pass date param to API)
- Shows "Mar 29" format when not today, "Today" when today

**Click Interaction:**
- Hovering a node: node scales to 1.15x, glow intensifies (double shadow spread), connected edge brightens to opacity 0.8, cursor: pointer
- Clicking a node: zoom animation toward the clicked node (d3 zoom.translateTo + scaleTo over 400ms), then `goto(href)` after animation completes
- Click on center node: no navigation, just a satisfying pulse animation

**Data:**
- On mount: fetch `health/today`, `supplements/today`, `pantry`, `calories/today` via `fetchSafe` (never crashes)
- On date change: re-fetch all with date param
- Stat computation: Steps from latest `steps` metric, calories from sum of calorie entries, supplements taken/total, pantry item count

**Mobile:**
- Same physics, just tighter layout (reduce link distance to 120)
- Touch: drag nodes, pinch zoom, tap to navigate
- No hover effects (touch doesn't hover)

**Performance:**
- SVG rendering, not Canvas (simpler, works with CSS transitions)
- Only 5 nodes + 4 edges — no performance concerns
- `will-change: transform` on node groups for GPU compositing

#### PWA Installation

The app MUST be installable on Android as a standalone app (no browser chrome).

**`pwa/static/manifest.json`:**
```json
{
  "name": "LifeOS",
  "short_name": "LifeOS",
  "description": "Personal life management dashboard",
  "start_url": "/app",
  "display": "standalone",
  "background_color": "#0f0f14",
  "theme_color": "#0f0f14",
  "orientation": "portrait",
  "icons": [
    { "src": "/app/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/app/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Icons:** Generate proper LifeOS icons (dark background, indigo accent, "L" lettermark or brain/node graphic). NOT blank/placeholder PNGs. Use an SVG → PNG conversion or programmatic canvas generation during build.

**`pwa/src/app.html`** must include:
```html
<meta name="theme-color" content="#0f0f14" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="manifest" href="%sveltekit.assets%/manifest.json" />
```

**Service worker** (`pwa/src/service-worker.ts`):
- Cache all static assets on install
- Network-first for API calls (fall back to cache)
- Stale-while-revalidate for assets
- Cache version tied to build hash

#### `/app/health` — Health Detail

- **Top bar**: Today | 7D | 30D | 90D toggle buttons (pill style, accent color when active)
- **Metric cards**: Row of 6 cards (Steps, HR, HRV, SpO2, Weight, Sleep)
  - Cards change based on selected period:
    - **Today**: Show latest value per `metric_type` from `health/today`. Label: "today".
    - **7D / 30D / 90D**: Show AVERAGE value per `metric_type` from `health/history?days={N}`. Label: "7d avg" / "30d avg" / "90d avg".
  - Each card: large number, unit + period label below
  - Subtle trend arrow (↑↓) comparing current period avg to prior period (e.g., 7D avg vs previous 7D avg)
  - If no data for a metric: show "—" with muted text
- **Charts section**: One multi-line chart (Chart.js)
  - Only shown when 7D/30D/90D is selected (not Today)
  - X-axis: dates
  - Y-axis: auto-scaled per dataset
  - Datasets: steps (blue), heart rate (red), sleep hours (purple)
  - Data from `health/history?days={selected}&metric=all`
  - Smooth curves, gradient fill below lines, no grid
- **Empty state**: "No health data yet. Connect Health Connect on your phone to start tracking."

**Note on timezone**: The API uses UTC for `CURRENT_DATE`. The VPS timezone is set to `America/Edmonton` via TZ env var. Ensure the API server process inherits this so "today" matches the user's local time.

#### `/app/meals` — Meals & Calories

- **Calorie summary card**: Today's total calories + macro breakdown (protein/carbs/fat as colored bar segments)
  - Data from `calories/today`
  - If empty: "No meals logged today"
- **Log meal button**: "+" button opens form to log a meal:
  - Fields: meal type (breakfast/lunch/dinner/snack), description, calories, protein_g, carbs_g, fat_g (all optional except description)
  - Quick presets: "Ate out — estimate" button that just takes a description and rough calorie count
  - Submit → POST to new API endpoint `POST /api/calories/log`
- **New API endpoint needed**: `POST /api/calories/log` — Insert into `lifeos.calorie_log` with `log_date = CURRENT_DATE`
- **Calorie dedup**: Before inserting, check if an entry already exists for the same `meal_type` + `log_date = CURRENT_DATE`. If it does, UPSERT (update the existing row) instead of creating a duplicate. The API should handle this server-side — the PWA doesn't need to ask confirmation, just silently replace.
- **Weekly meal plan**: Vertical day-by-day list (NOT horizontal scroll)
  - Each day is a card/row showing: day name (Mon, Tue...), date, recipe name, calories, servings, prep + cook time
  - Status DROPDOWN (not click-to-cycle): planned / cooked / skipped / ate out — user can go back to any status
  - When status changes to "cooked": auto-log calories for dinner AND next day's lunch (same recipe, same calories)
  - Status changes must PERSIST — after refresh, the updated status should still show. The PWA must call the API and re-fetch the plan after status change.
  - **Tap a meal card to expand inline** → shows full recipe detail (ingredients, instructions, macros, cook time) fetched from `GET /api/meals/recipes/:id` using the meal's `recipe_id`. This is separate from the recipe browser — meal cards let you see "what am I cooking today" without searching.
  - The API must include `recipe_id` in the meal plan response (add to SQL SELECT if not already)
  - Each card also shows the "packed lunch" note (e.g., "← Mon's leftovers")
  - Full width cards, stacked vertically, easy to read on mobile
  - Data from `meals/plan?week=current`
  - If empty: "No meal plan for this week"
- **Recipe display**: Each recipe card must show REALISTIC times:
  - Prep time AND cook time separately (e.g., "10 min prep · 20 min cook")
  - Servings count (e.g., "2 servings")
  - Total calories per serving
  - Recipes should use proper cook times — NOT generic "5 min" for everything
- **Calendar integration**: When a meal plan is generated, a Google Calendar event is created for each cooking day at 6 PM (e.g., "🍳 Cook: Chicken Tikka Masala"). If the user has a conflicting event (like violin at 8 PM), the cook event is set earlier (5:30 PM). A "Grocery shopping" event is added for the Sunday BEFORE the meal plan starts.
- **Recipe browser**: Collapsible section below meal plan
  - **Collapsed by default**: Shows header "Recipes (12)" with expand arrow. Recipes list only visible when expanded or when user types in search.
  - Search input with debounce — typing auto-expands the list
  - Recipe cards: compact, name + calories + cook time on one line
  - Limit visible to 5, with "Show all X recipes" button to expand
  - Click a recipe card → expands or navigates to detail view showing:
    - Full ingredients list (from `ingredients` JSON column)
    - Step-by-step instructions
    - Prep time + cook time
    - Servings
    - Full macros (calories, protein, carbs, fat per serving)
    - Rating with ability to rate (1-5 stars)
    - Times cooked counter
    - Tags
    - Source URL (if available, as a link)
  - Data from `meals/recipes?search=...` for list, `GET /api/meals/recipes/:id` for detail
  - **New API endpoint needed**: `GET /api/meals/recipes/:id` — returns full recipe with all columns from `lifeos.recipes`
- **Recipes are append-only**: Never delete recipes. When generating meal plans, check if a recipe with the same name already exists before inserting. Recipes accumulate over time and build a personal cookbook.

#### `/app/pantry` — Pantry Inventory

- **Summary bar**: Total items count, expiring soon count (amber badge), expired count (red badge)
- **Item list**: Grouped by category with section headers
  - Each item: name (`item` column), quantity + unit, expiry badge
  - Expiry badge colors: green (>7 days), amber (1-7 days), red (expired)
  - If `expiry_date` is null: no badge
  - Swipe left or tap delete icon to remove item (DELETE via API)
  - Tap item to edit quantity/expiry inline
- **Add item form**: FAB "+" button opens a bottom sheet or inline form:
  - Fields: item name, quantity, unit (dropdown: g, kg, ml, L, pcs), category (dropdown or free text), expiry date (date picker)
  - Submit → POST to new API endpoint `POST /api/pantry/add`
- **Photo upload**: Camera button for bulk add via photo analysis
- **Empty state**: "Pantry is empty. Tap + to add items."
- **New API endpoints needed**:
  - `POST /api/pantry/add` — Insert item into `lifeos.pantry`
  - `DELETE /api/pantry/:id` — Remove item from `lifeos.pantry`
  - `PUT /api/pantry/:id` — Update item quantity/expiry

#### `/app/supplements` — Supplement Tracker

- **Progress ring**: Large SVG ring showing taken/total ratio
  - Fill color transitions from accent to success as progress increases
- **Supplement list**: Sorted by time_of_day (morning first)
  - Each entry: supplement name, dosage (in tablets with mg in brackets), time of day, reason (if any)
  - Toggle button: untaken (outline) → taken (filled green with checkmark)
  - Click toggles via `POST /supplements/:id/taken`
  - Data from `supplements/today` (JOIN query)
- **Add supplement form**: FAB "+" button opens form:
  - Fields: name, dosage (number), unit (mg/IU/g), time of day (morning/evening), max safe dosage (optional)
  - Submit → POST to new API endpoint `POST /api/supplements/add`
- **Delete/edit**: Long press or swipe to delete/edit a supplement
- **New API endpoints needed**:
  - `POST /api/supplements/add` — Insert into `lifeos.supplements`
  - `DELETE /api/supplements/:id` — Remove from `lifeos.supplements`
  - `PUT /api/supplements/:id` — Update dosage/timing
- **Empty state**: "No supplements configured. Tap + to add your stack."

#### `/app/preferences` — Settings

- **Sections**: Dietary Preferences, Supplement List, Notification Settings
- Each section shows key-value pairs from `preferences` table
- Editable: click value to edit inline, auto-saves via `PUT /preferences`
- **Empty state**: Show form fields with placeholder text

### Layout & Navigation

- **Bottom nav bar**: Fixed, 5 tabs (Home, Health, Meals, Pantry, Supps)
  - Active tab: accent color icon + label
  - Inactive: muted icon, no label on mobile
  - 56px height, glass-morphism background (blur + transparency)
  - **No tap highlight**: All interactive elements must have `-webkit-tap-highlight-color: transparent` — no green/blue flash on mobile tap. Apply globally in `app.css`.
- **Page transitions**: Fade/slide (200ms)
- **Pull-to-refresh**: On all detail pages
- **Loading states**: Skeleton placeholders (pulsing rectangles), never blank screens

---

## Phase 4 Tests

### PWA Tests
- [ ] PWA installs on Android home screen without browser chrome
- [ ] manifest.json has `display: standalone`
- [ ] Service worker registers and caches assets
- [ ] Dashboard node graph renders with 4 nodes + center
- [ ] Clicking a node navigates to the correct detail page
- [ ] All pages show empty states gracefully when no data exists
- [ ] 7D/30D/90D toggles switch chart data on health page
- [ ] Health vitals cards show latest value per metric_type
- [ ] Meal plan status toggle sends correct value (cooked/skipped/ate_out)
- [ ] Supplement mark-as-taken updates UI immediately
- [ ] Pantry groups items by category
- [ ] Expiry badges show correct color based on date
- [ ] Photo upload captures and sends base64 image
- [ ] Preferences load and save correctly
- [ ] No console errors on any page with empty data
- [ ] No `.toLocaleString()` or `.filter()` crashes on null/undefined

### API Tests
- [ ] `GET /api/health/today` returns metric array with correct columns
- [ ] `GET /api/health/history?days=7` returns aggregated daily data
- [ ] `GET /api/health/history?days=90&metric=steps` filters by metric
- [ ] `POST /api/health-webhook` writes metrics to MotherDuck (not just logs them)
- [ ] `GET /api/supplements/today` JOINs supplements + supplement_log
- [ ] `POST /api/supplements/:id/taken` uses parameterized query (no SQL injection)
- [ ] `GET /api/calories/today` returns entries + computed totals
- [ ] `GET /api/calories/history?days=30` returns daily summaries
- [ ] `GET /api/pantry` returns items with correct column names (item, expiry_date)
- [ ] `GET /api/preferences` returns key/value/skill rows
- [ ] `PUT /api/preferences` upserts correctly
- [ ] All endpoints return `{ data: [...] }` wrapper consistently
- [ ] All SQL uses parameterized queries — zero string interpolation

---

# Phase 5: Obsidian + Smart Home + Advanced

## Goal
Deep Obsidian vault integration (read/write, personality learning), Wyze lamp clock (sleep-aware alarm), Lefant M210 vacuum (auto-clean), bill tracking from email.

## Implementation Plan

### Step 22: Obsidian vault integration

#### VPS Setup (one-time)
1. Clone MyVault repo on VPS using GitHub token from `.env`:
   ```bash
   cd /root
   git clone https://x-access-token:${GITHUB_TOKEN}@github.com/shreyas-venkat/MyVault.git ~/MyVault
   cd ~/MyVault
   git config user.email "lifeos@shreyas.dev"
   git config user.name "LifeOS"
   mkdir -p LifeOS/daily-summaries
   ```
2. Mount `~/MyVault` into the container as an additional directory so the agent can read/write vault notes:
   - Register the main group with `containerConfig.additionalMounts` pointing to `~/MyVault`
   - Or update `src/container-runner.ts` to mount `~/MyVault` at `/workspace/extra/vault` for the main group

#### Daily sync (scheduled task: `lifeos-obsidian-sync`, cron `0 3 * * *`)
1. Read vault notes for context about user (preferences, interests, writing style)
2. Update `groups/discord_main/CLAUDE.md` personality section with learned traits
3. Write to vault `LifeOS/` folder:
   - `daily-summaries/YYYY-MM-DD.md` — health metrics, meals, activity, bot actions for yesterday
   - `learned-preferences.md` — accumulated user preferences discovered from conversations
   - `health-insights.md` — notable health observations and trends
4. After writing: `git add . && git commit -m "LifeOS daily update" && git push`
5. Obsidian syncs via GitHub plugin on user's devices

### Step 23: Smart home integrations (deferred)
Smart home device integrations (lamp, vacuum) are deferred until device APIs are confirmed compatible. The ecozy lamp uses a proprietary app (not Tuya) and the Lefant vacuum needs Tuya IoT developer registration. These can be added later when credentials are available.

### Step 25: Bill tracking from email
1. Parse RBC bank email notifications (already categorized as "bank" in Phase 1)
2. Extract: amount, merchant, date, recurring pattern
3. Store in new table:
```sql
CREATE TABLE IF NOT EXISTS lifeos.bills (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    amount DOUBLE,
    merchant VARCHAR,
    due_date DATE,
    recurring VARCHAR,
    status VARCHAR DEFAULT 'upcoming',
    source_email_id VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
4. Remind user 3 days before due date via Discord DM
5. Monthly spending summary to `#reminders` channel

## Phase 5 Tests
- [ ] Bot reads Obsidian vault notes and references them in conversation
- [ ] Daily summary written to vault and visible in Obsidian
- [ ] Wyze lamp turns on/off via bot command
- [ ] Sleep-aware alarm adjusts brightness based on sleep data
- [ ] Lefant vacuum starts from Discord command
- [ ] Bill amounts extracted correctly from RBC emails
- [ ] Bill reminders fire 3 days before due date

---

# Post-Build: Manual Configuration Steps

After all code is built, user needs to do these one-time manual steps:

1. **Discord**: Create "LifeOS" server, create channels (#email-digest, #meals, #health, #activity-log, #reminders), invite bot, get channel IDs, update config
2. **Gmail OAuth**: Run `npx @gongrzhe/server-gmail-autoauth-mcp auth` on VPS (browser-based one-time flow)
3. **Health Connect**: Install Health Connect Webhook app on phone, configure webhook URL to `https://{domain}/api/health-webhook`, select all metrics, set 15-min interval
4. **Wyze**: Add Wyze account credentials to Agent Vault on VPS
5. **Tuya**: Register on Tuya IoT Developer Platform, extract Lefant M210 device keys, add to Agent Vault
6. **Calgary Co-op**: Add login credentials to Agent Vault for Playwright automation
7. **Domain**: Point DNS A record to VPS IP, run certbot for SSL

---

## Definition of Done (All Phases)

- [ ] All implementation steps (0-25) completed
- [ ] All phase-specific tests passing
- [ ] Full test suite exits 0
- [ ] Linters pass (eslint / tsc)
- [ ] No dead code, no debug statements
- [ ] SPEC.md updated to reflect any deviations
- [ ] Deploy workflow triggers successfully on push to main
- [ ] Manual config steps documented clearly above
