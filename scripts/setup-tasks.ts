/**
 * LifeOS Scheduled Tasks Setup Script
 *
 * Registers all 16 LifeOS scheduled tasks by writing IPC JSON files
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
    // 1. Email scan (every 15 min)
    {
      id: 'lifeos-email-scan',
      schedule_type: 'cron',
      schedule_value: '*/15 * * * *',
      group_folder: 'main',
      chat_jid: config.mainChannelJid,
      context_mode: 'group',
      prompt:
        'Check Gmail inbox for new emails. For each unread email: categorize it (actionable, transactions, bank, life, github, spam_promotions, newsletters), take appropriate action (trash spam, alert on important), and log to MotherDuck lifeos.emails table. If actionable or bank, alert via Discord DM.',
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
        'Generate daily email digest. Query lifeos.emails for all emails processed today. Summarize by category with counts. Post to the email digest channel.',
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
        'Good morning briefing. Check: 1) Today\'s Google Calendar events, 2) Any important emails since last evening, 3) Reminders due today. Format as a concise morning briefing and send to Discord DM.',
    },

    // 4. Reminder checker (every 5 min, with pre-check script)
    {
      id: 'lifeos-reminder-checker',
      schedule_type: 'cron',
      schedule_value: '*/5 * * * *',
      group_folder: 'main',
      chat_jid: config.mainChannelJid,
      context_mode: 'group',
      prompt:
        "Check lifeos.reminders for reminders where due_at <= now() and status = 'active'. For each: send a Discord DM reminder. For recurring reminders, calculate next due_at from recurring_cron and update. For one-time reminders, set status to 'completed'.",
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
        'Generate weekly meal plan. Read dietary preferences from lifeos.dietary_preferences. Read current pantry from lifeos.pantry. Read previous recipe ratings from lifeos.recipes. Plan 7 dinners (each makes 2 portions for dinner + next-day lunch). Office days (Tue/Thu/Fri) need packable lunches. Post plan to meals channel and DM user for approval.',
    },

    // 6. Cooking check-in (7 PM daily)
    {
      id: 'lifeos-cooking-checkin',
      schedule_type: 'cron',
      schedule_value: '0 19 * * *',
      group_folder: 'main',
      chat_jid: config.mainChannelJid,
      context_mode: 'group',
      prompt:
        "Check today's meal plan from lifeos.meal_plans. Ask user: 'How was [recipe]? Rate 1-5.' If user cooked, log calories from recipe data to lifeos.calorie_log and deduct ingredients from lifeos.pantry.",
    },

    // 7. Pantry expiry check (8 AM daily, with pre-check script)
    {
      id: 'lifeos-pantry-expiry',
      schedule_type: 'cron',
      schedule_value: '0 8 * * *',
      group_folder: 'main',
      chat_jid: config.mainChannelJid,
      context_mode: 'group',
      prompt:
        'Check lifeos.pantry for items with expiry_date within 3 days. Warn user about expiring items.',
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
        'Generate daily calorie summary. Query lifeos.calorie_log for today. Post total calories, protein, carbs, fat to health channel.',
    },

    // 9. Evening supplement recommendation (9 PM MT)
    {
      id: 'lifeos-evening-supplements',
      schedule_type: 'cron',
      schedule_value: '0 21 * * *',
      group_folder: 'main',
      chat_jid: config.mainChannelJid,
      context_mode: 'group',
      prompt:
        "Generate morning supplement recommendations for tomorrow. Query today's health data from lifeos.health_metrics. Analyze sleep quality, HRV, activity level. Adjust dosages within safe ranges (check lifeos.supplements.max_safe_dosage). DM recommendations with reasoning. Log to lifeos.supplement_log.",
    },

    // 10. Morning supplement recommendation (6 AM MT)
    {
      id: 'lifeos-morning-supplements',
      schedule_type: 'cron',
      schedule_value: '0 6 * * *',
      group_folder: 'main',
      chat_jid: config.mainChannelJid,
      context_mode: 'group',
      prompt:
        "Generate evening supplement recommendations. Query today's health data. DM recommendations with reasoning. Log to lifeos.supplement_log.",
    },

    // 11. Step monitoring (8 PM daily, with pre-check script)
    {
      id: 'lifeos-step-monitoring',
      schedule_type: 'cron',
      schedule_value: '0 20 * * *',
      group_folder: 'main',
      chat_jid: config.mainChannelJid,
      context_mode: 'group',
      prompt:
        'Query lifeos.health_metrics for steps over last 3 days. If average below 5000, send friendly fitness nudge. Log to lifeos.fitness_nudges.',
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
        'Query weight from lifeos.health_metrics for last 2 weeks. Calculate trend. If trending up, send gentle nudge about activity.',
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
        'Generate daily health summary. Query lifeos.health_metrics for today: sleep duration/quality, steps, active calories, resting HR, HRV, SpO2, weight + 7-day trend. Include calories + macros from lifeos.calorie_log. Include supplements recommended vs taken from lifeos.supplement_log. Post to health channel.',
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
        'Check lifeos.bills for bills due within 3 days. Send Discord DM reminder for each.',
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
        'Generate monthly spending summary from lifeos.bills for last month. Categorize by merchant/type. Post to reminders channel.',
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
