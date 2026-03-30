/**
 * LifeOS Scheduled Tasks Setup Script
 *
 * Registers all 17 LifeOS scheduled tasks by writing IPC JSON files
 * to data/ipc/{group_folder}/tasks/. When the IPC watcher picks them
 * up, they are persisted to SQLite and scheduled.
 *
 * Usage:
 *   LIFEOS_CHANNELS='{"mainChannelJid":"dc:123",...}' npx tsx scripts/setup-tasks.ts
 *   -- or --
 *   npx tsx scripts/setup-tasks.ts --config ./channels.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { CronExpressionParser } from 'cron-parser';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface TaskConfig {
  mainChannelJid: string;
  emailDigestJid: string;
  mealsChannelJid: string;
  healthChannelJid: string;
  remindersChannelJid: string;
  activityLogJid: string;
}

const REQUIRED_CHANNEL_KEYS: (keyof TaskConfig)[] = [
  'mainChannelJid',
  'emailDigestJid',
  'mealsChannelJid',
  'healthChannelJid',
  'remindersChannelJid',
  'activityLogJid',
];

export function validateConfig(config: unknown): TaskConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error('TaskConfig must be a non-null object');
  }
  const obj = config as Record<string, unknown>;
  for (const key of REQUIRED_CHANNEL_KEYS) {
    if (typeof obj[key] !== 'string' || (obj[key] as string).trim() === '') {
      throw new Error(`TaskConfig.${key} is required and must be a non-empty string`);
    }
  }
  return obj as unknown as TaskConfig;
}

// ---------------------------------------------------------------------------
// Task definition
// ---------------------------------------------------------------------------

export interface TaskDefinition {
  id: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  group_folder: string;
  chat_jid: string;
  context_mode: 'group' | 'isolated';
  prompt: string;
  script?: string;
}

export function buildTaskDefinitions(config: TaskConfig): TaskDefinition[] {
  const scriptsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'tasks',
  );

  return [
    // 1. Email scan (every 15 min) → #email-digest
    {
      id: 'lifeos-email-scan',
      schedule_type: 'cron',
      schedule_value: '*/15 * * * *',
      group_folder: 'main',
      chat_jid: config.emailDigestJid,
      context_mode: 'group',
      prompt:
        'Check Gmail inbox for new unread emails. For each: categorize it (actionable, transactions, bank, life, github, spam_promotions, newsletters). Trash spam/promotions. For actionable or bank emails, use the send_message MCP tool to alert the user via Discord immediately. Log all processed emails to MotherDuck lifeos.emails table.',
    },

    // 2. Daily email digest (8 PM MT)
    {
      id: 'lifeos-daily-email-digest',
      schedule_type: 'cron',
      schedule_value: '0 20 * * *',
      group_folder: 'main',
      chat_jid: config.emailDigestJid,
      context_mode: 'group',
      prompt:
        'Generate daily email digest. Query lifeos.emails for all emails processed today. Summarize by category with counts. Use the send_message MCP tool to post the digest.',
    },

    // 3. Morning briefing (6 AM MT weekdays)
    {
      id: 'lifeos-morning-briefing',
      schedule_type: 'cron',
      schedule_value: '0 6 * * 1-5',
      group_folder: 'main',
      chat_jid: config.mainChannelJid,
      context_mode: 'group',
      prompt:
        'Good morning briefing. Check: 1) Today\'s Google Calendar events using the google_calendar MCP tools, 2) Any important emails since last evening via Gmail MCP, 3) Reminders due today from lifeos.reminders. Format as a concise morning briefing and use the send_message MCP tool to send it.',
    },

    // 4. Reminder checker (every 5 min, with pre-check script) → #reminders
    {
      id: 'lifeos-reminder-checker',
      schedule_type: 'cron',
      schedule_value: '*/5 * * * *',
      group_folder: 'main',
      chat_jid: config.remindersChannelJid,
      context_mode: 'group',
      prompt:
        "Check lifeos.reminders for reminders where due_at <= now() and status = 'active'. For each due reminder: use the send_message MCP tool to send the reminder text to the user via Discord. For recurring reminders, calculate next due_at from recurring_cron and update. For one-time reminders, set status to 'completed'.",
      script: path.join(scriptsDir, 'reminder-check.sh'),
    },

    // 5. Weekly meal plan (Saturday 9 AM MT)
    {
      id: 'lifeos-weekly-meal-plan',
      schedule_type: 'cron',
      schedule_value: '0 9 * * 6',
      group_folder: 'main',
      chat_jid: config.mealsChannelJid,
      context_mode: 'group',
      prompt:
        'Generate weekly meal plan. Read dietary preferences from lifeos.dietary_preferences and current pantry from lifeos.pantry. Plan 7 dinners (2 portions each). Office days (Tue/Thu/Fri) need packable lunches. Use the send_message MCP tool to post the plan and ask for approval.',
    },

    // 6. Cooking check-in (7 PM daily) → #meals
    {
      id: 'lifeos-cooking-checkin',
      schedule_type: 'cron',
      schedule_value: '0 19 * * *',
      group_folder: 'main',
      chat_jid: config.mealsChannelJid,
      context_mode: 'group',
      prompt:
        "Check today's meal plan from lifeos.meal_plans. Use the send_message MCP tool to ask user: 'How was [recipe]? Rate 1-5.' If user cooked, log calories from recipe data to lifeos.calorie_log and deduct ingredients from lifeos.pantry.",
    },

    // 7. Pantry expiry check (8 AM daily, with pre-check script) → #meals
    {
      id: 'lifeos-pantry-expiry',
      schedule_type: 'cron',
      schedule_value: '0 8 * * *',
      group_folder: 'main',
      chat_jid: config.mealsChannelJid,
      context_mode: 'group',
      prompt:
        'Check lifeos.pantry for items with expiry_date within 3 days. If any found, use the send_message MCP tool to warn the user about expiring items.',
      script: path.join(scriptsDir, 'pantry-expiry-check.sh'),
    },

    // 8. Daily calorie summary (9 PM MT)
    {
      id: 'lifeos-daily-calorie-summary',
      schedule_type: 'cron',
      schedule_value: '0 21 * * *',
      group_folder: 'main',
      chat_jid: config.healthChannelJid,
      context_mode: 'group',
      prompt:
        'Generate daily calorie summary. Query lifeos.calorie_log for today. Use the send_message MCP tool to post total calories, protein, carbs, fat.',
    },

    // 9. Evening supplement recommendation (9 PM MT) → #health
    {
      id: 'lifeos-evening-supplements',
      schedule_type: 'cron',
      schedule_value: '0 21 * * *',
      group_folder: 'main',
      chat_jid: config.healthChannelJid,
      context_mode: 'group',
      prompt:
        "Generate morning supplement recommendations for tomorrow. Query today's health data from lifeos.health_metrics. Adjust dosages within safe ranges (check lifeos.supplements.max_safe_dosage). Use the send_message MCP tool to send recommendations with reasoning. Log to lifeos.supplement_log.",
    },

    // 10. Morning supplement recommendation (6 AM MT) → #health
    {
      id: 'lifeos-morning-supplements',
      schedule_type: 'cron',
      schedule_value: '0 6 * * *',
      group_folder: 'main',
      chat_jid: config.healthChannelJid,
      context_mode: 'group',
      prompt:
        "Generate evening supplement recommendations. Query today's health data from lifeos.health_metrics. Use the send_message MCP tool to send recommendations. Log to lifeos.supplement_log.",
    },

    // 11. Step monitoring (8 PM daily, with pre-check script) → #health
    {
      id: 'lifeos-step-monitoring',
      schedule_type: 'cron',
      schedule_value: '0 20 * * *',
      group_folder: 'main',
      chat_jid: config.healthChannelJid,
      context_mode: 'group',
      prompt:
        'Query lifeos.health_metrics for steps over last 3 days. If average below 5000, use the send_message MCP tool to send a friendly fitness nudge. Log to lifeos.fitness_nudges.',
      script: path.join(scriptsDir, 'steps-check.sh'),
    },

    // 12. Weekly weight trend (Sunday 9 AM)
    {
      id: 'lifeos-weekly-weight-trend',
      schedule_type: 'cron',
      schedule_value: '0 9 * * 0',
      group_folder: 'main',
      chat_jid: config.healthChannelJid,
      context_mode: 'group',
      prompt:
        'Query weight from lifeos.health_metrics for last 2 weeks. Calculate trend. If trending up, use the send_message MCP tool to send a gentle nudge about activity.',
    },

    // 13. Daily health summary (9 PM MT)
    {
      id: 'lifeos-daily-health-summary',
      schedule_type: 'cron',
      schedule_value: '0 21 * * *',
      group_folder: 'main',
      chat_jid: config.healthChannelJid,
      context_mode: 'group',
      prompt:
        'Generate daily health summary. Query lifeos.health_metrics for today: sleep, steps, calories, HR, HRV, SpO2, weight. Include calories from lifeos.calorie_log and supplements from lifeos.supplement_log. Use the send_message MCP tool to post the summary.',
    },

    // 14. Obsidian daily sync (3 AM daily)
    {
      id: 'lifeos-obsidian-sync',
      schedule_type: 'cron',
      schedule_value: '0 3 * * *',
      group_folder: 'main',
      chat_jid: config.activityLogJid,
      context_mode: 'group',
      prompt:
        'Generate daily summary for Obsidian vault. Write to LifeOS/daily-summaries/YYYY-MM-DD.md covering health, meals, activity, and bot actions for yesterday. Update LifeOS/learned-preferences.md if new preferences learned. Commit and push to MyVault repo.',
    },

    // 15. Bill reminder check (8 AM daily, with pre-check script)
    {
      id: 'lifeos-bill-reminder',
      schedule_type: 'cron',
      schedule_value: '0 8 * * *',
      group_folder: 'main',
      chat_jid: config.remindersChannelJid,
      context_mode: 'group',
      prompt:
        'Check lifeos.bills for bills due within 3 days. For each, use the send_message MCP tool to alert the user.',
      script: path.join(scriptsDir, 'bill-check.sh'),
    },

    // 16. Monthly spending summary (1st of month, 9 AM)
    {
      id: 'lifeos-monthly-spending',
      schedule_type: 'cron',
      schedule_value: '0 9 1 * *',
      group_folder: 'main',
      chat_jid: config.remindersChannelJid,
      context_mode: 'group',
      prompt:
        'Generate monthly spending summary from lifeos.bills for last month. Categorize by merchant/type. Use the send_message MCP tool to post the summary.',
    },

    // 17. Smart cooking suggestion (5 PM daily, Mountain Time)
    {
      id: 'lifeos-cooking-suggestion',
      schedule_type: 'cron',
      schedule_value: '0 17 * * *',
      group_folder: 'main',
      chat_jid: config.mealsChannelJid,
      context_mode: 'group',
      prompt:
        'Check the pantry for items expiring within 3 days using mcp__motherduck__query. Then check lifeos.recipes for recipes whose ingredients overlap with available pantry items. Score by: expiring item usage (highest priority), ingredient match percentage, user rating, days since last cooked. Post the top 3 recipe suggestions to this channel with match percentages and what\'s expiring. If nothing matches, suggest ordering groceries or eating out. Be concise — just the recipe names, match %, and why.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Cron validation
// ---------------------------------------------------------------------------

export function validateCronExpression(expr: string): boolean {
  try {
    CronExpressionParser.parse(expr);
    return true;
  } catch (_err: unknown) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// IPC file generation
// ---------------------------------------------------------------------------

export interface IpcTaskFile {
  type: 'schedule_task';
  taskId: string;
  prompt: string;
  schedule_type: string;
  schedule_value: string;
  context_mode: string;
  targetJid: string;
  groupFolder: string;
  script?: string;
}

export function buildIpcPayload(task: TaskDefinition): IpcTaskFile {
  const payload: IpcTaskFile = {
    type: 'schedule_task',
    taskId: task.id,
    prompt: task.prompt,
    schedule_type: task.schedule_type,
    schedule_value: task.schedule_value,
    context_mode: task.context_mode,
    targetJid: task.chat_jid,
    groupFolder: task.group_folder,
  };
  if (task.script) {
    payload.script = task.script;
  }
  return payload;
}

export function writeIpcFiles(
  tasks: TaskDefinition[],
  dataDir: string,
): string[] {
  const writtenFiles: string[] = [];

  for (const task of tasks) {
    const ipcDir = path.join(dataDir, 'ipc', task.group_folder, 'tasks');
    fs.mkdirSync(ipcDir, { recursive: true });

    const payload = buildIpcPayload(task);
    const filename = `${task.id}.json`;
    const filePath = path.join(ipcDir, filename);

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    writtenFiles.push(filePath);
  }

  return writtenFiles;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function loadConfig(): TaskConfig {
  // Try --config flag first
  const configFlagIndex = process.argv.indexOf('--config');
  if (configFlagIndex !== -1 && process.argv[configFlagIndex + 1]) {
    const configPath = path.resolve(process.argv[configFlagIndex + 1]);
    const raw = fs.readFileSync(configPath, 'utf-8');
    return validateConfig(JSON.parse(raw));
  }

  // Try LIFEOS_CHANNELS env var
  if (process.env.LIFEOS_CHANNELS) {
    return validateConfig(JSON.parse(process.env.LIFEOS_CHANNELS));
  }

  throw new Error(
    'No channel config found. Pass --config <path> or set LIFEOS_CHANNELS env var.',
  );
}

// Only run CLI when executed directly (not imported)
const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const config = loadConfig();
  const tasks = buildTaskDefinitions(config);

  // Validate all cron expressions before writing
  for (const task of tasks) {
    if (task.schedule_type === 'cron' && !validateCronExpression(task.schedule_value)) {
      console.error(`Invalid cron expression for task ${task.id}: ${task.schedule_value}`);
      process.exit(1);
    }
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  const written = writeIpcFiles(tasks, dataDir);
  console.log(`Registered ${written.length} scheduled tasks:`);
  for (const f of written) {
    console.log(`  ${f}`);
  }
}
