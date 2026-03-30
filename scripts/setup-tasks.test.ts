import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CronExpressionParser } from 'cron-parser';

import {
  type IpcTaskFile,
  type TaskConfig,
  type TaskDefinition,
  buildIpcPayload,
  buildTaskDefinitions,
  validateConfig,
  validateCronExpression,
  writeIpcFiles,
} from './setup-tasks.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_CONFIG: TaskConfig = {
  mainChannelJid: 'dc:111111111111',
  emailDigestJid: 'dc:222222222222',
  mealsChannelJid: 'dc:333333333333',
  healthChannelJid: 'dc:444444444444',
  remindersChannelJid: 'dc:555555555555',
  activityLogJid: 'dc:666666666666',
};

const EXPECTED_TASK_COUNT = 17;

// Tasks that should reference a pre-check script
const TASKS_WITH_SCRIPTS = [
  'lifeos-reminder-checker',
  'lifeos-pantry-expiry',
  'lifeos-step-monitoring',
  'lifeos-bill-reminder',
];

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

describe('validateConfig', () => {
  it('accepts a valid config', () => {
    const result = validateConfig(VALID_CONFIG);
    expect(result).toEqual(VALID_CONFIG);
  });

  it('throws on null', () => {
    expect(() => validateConfig(null)).toThrow('non-null object');
  });

  it('throws on non-object', () => {
    expect(() => validateConfig('string')).toThrow('non-null object');
  });

  it('throws when mainChannelJid is missing', () => {
    const bad = { ...VALID_CONFIG, mainChannelJid: undefined };
    expect(() => validateConfig(bad)).toThrow('mainChannelJid');
  });

  it('throws when a channel JID is empty string', () => {
    const bad = { ...VALID_CONFIG, healthChannelJid: '' };
    expect(() => validateConfig(bad)).toThrow('healthChannelJid');
  });

  it('throws when a channel JID is whitespace only', () => {
    const bad = { ...VALID_CONFIG, emailDigestJid: '   ' };
    expect(() => validateConfig(bad)).toThrow('emailDigestJid');
  });

  it('throws for every required key when all are missing', () => {
    expect(() => validateConfig({})).toThrow('mainChannelJid');
  });
});

// ---------------------------------------------------------------------------
// Task definitions
// ---------------------------------------------------------------------------

describe('buildTaskDefinitions', () => {
  let tasks: TaskDefinition[];

  beforeEach(() => {
    tasks = buildTaskDefinitions(VALID_CONFIG);
  });

  it(`produces exactly ${EXPECTED_TASK_COUNT} tasks`, () => {
    expect(tasks).toHaveLength(EXPECTED_TASK_COUNT);
  });

  it('every task has required fields', () => {
    for (const task of tasks) {
      expect(task.id).toBeTruthy();
      expect(task.prompt).toBeTruthy();
      expect(task.schedule_type).toBeTruthy();
      expect(task.schedule_value).toBeTruthy();
      expect(task.group_folder).toBeTruthy();
      expect(task.chat_jid).toBeTruthy();
      expect(['group', 'isolated']).toContain(task.context_mode);
    }
  });

  it('all task IDs are unique', () => {
    const ids = tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all tasks use cron schedule type', () => {
    for (const task of tasks) {
      expect(task.schedule_type).toBe('cron');
    }
  });

  it('every cron expression is valid', () => {
    for (const task of tasks) {
      expect(() => CronExpressionParser.parse(task.schedule_value)).not.toThrow();
    }
  });

  it('tasks with scripts reference .sh files', () => {
    const withScripts = tasks.filter((t) => t.script);
    expect(withScripts).toHaveLength(TASKS_WITH_SCRIPTS.length);
    for (const task of withScripts) {
      expect(TASKS_WITH_SCRIPTS).toContain(task.id);
      expect(task.script).toMatch(/\.sh$/);
    }
  });

  it('tasks without scripts have no script field', () => {
    const withoutScripts = tasks.filter(
      (t) => !TASKS_WITH_SCRIPTS.includes(t.id),
    );
    for (const task of withoutScripts) {
      expect(task.script).toBeUndefined();
    }
  });

  it('uses configured channel JIDs correctly', () => {
    const emailDigestTask = tasks.find(
      (t) => t.id === 'lifeos-daily-email-digest',
    )!;
    expect(emailDigestTask.chat_jid).toBe(VALID_CONFIG.emailDigestJid);

    const mealPlanTask = tasks.find(
      (t) => t.id === 'lifeos-weekly-meal-plan',
    )!;
    expect(mealPlanTask.chat_jid).toBe(VALID_CONFIG.mealsChannelJid);

    const healthSummaryTask = tasks.find(
      (t) => t.id === 'lifeos-daily-health-summary',
    )!;
    expect(healthSummaryTask.chat_jid).toBe(VALID_CONFIG.healthChannelJid);

    const billTask = tasks.find((t) => t.id === 'lifeos-bill-reminder')!;
    expect(billTask.chat_jid).toBe(VALID_CONFIG.remindersChannelJid);

    const obsidianTask = tasks.find((t) => t.id === 'lifeos-obsidian-sync')!;
    expect(obsidianTask.chat_jid).toBe(VALID_CONFIG.activityLogJid);

    const cookingSuggestionTask = tasks.find(
      (t) => t.id === 'lifeos-cooking-suggestion',
    )!;
    expect(cookingSuggestionTask).toBeDefined();
    expect(cookingSuggestionTask.chat_jid).toBe(VALID_CONFIG.mealsChannelJid);
    expect(cookingSuggestionTask.schedule_value).toBe('0 17 * * *');
    expect(cookingSuggestionTask.context_mode).toBe('group');
  });

  it('all tasks belong to main group folder', () => {
    for (const task of tasks) {
      expect(task.group_folder).toBe('main');
    }
  });
});

// ---------------------------------------------------------------------------
// Cron validation helper
// ---------------------------------------------------------------------------

describe('validateCronExpression', () => {
  it('returns true for valid cron', () => {
    expect(validateCronExpression('*/15 * * * *')).toBe(true);
    expect(validateCronExpression('0 6 * * 1-5')).toBe(true);
    expect(validateCronExpression('0 9 1 * *')).toBe(true);
  });

  it('returns false for invalid cron', () => {
    expect(validateCronExpression('not a cron')).toBe(false);
    expect(validateCronExpression('60 * * * *')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// IPC payload generation
// ---------------------------------------------------------------------------

describe('buildIpcPayload', () => {
  it('produces correct IPC structure for task without script', () => {
    const task: TaskDefinition = {
      id: 'test-task',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      group_folder: 'main',
      chat_jid: 'dc:123',
      context_mode: 'group',
      prompt: 'Test prompt',
    };

    const payload = buildIpcPayload(task);

    expect(payload.type).toBe('schedule_task');
    expect(payload.taskId).toBe('test-task');
    expect(payload.prompt).toBe('Test prompt');
    expect(payload.schedule_type).toBe('cron');
    expect(payload.schedule_value).toBe('0 9 * * *');
    expect(payload.context_mode).toBe('group');
    expect(payload.targetJid).toBe('dc:123');
    expect(payload.groupFolder).toBe('main');
    expect(payload.script).toBeUndefined();
  });

  it('includes script path when task has a script', () => {
    const task: TaskDefinition = {
      id: 'scripted-task',
      schedule_type: 'cron',
      schedule_value: '*/5 * * * *',
      group_folder: 'main',
      chat_jid: 'dc:456',
      context_mode: 'group',
      prompt: 'Scripted prompt',
      script: '/path/to/check.sh',
    };

    const payload = buildIpcPayload(task);
    expect(payload.script).toBe('/path/to/check.sh');
  });
});

// ---------------------------------------------------------------------------
// IPC file writing
// ---------------------------------------------------------------------------

describe('writeIpcFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-tasks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes one JSON file per task', () => {
    const tasks = buildTaskDefinitions(VALID_CONFIG);
    const files = writeIpcFiles(tasks, tmpDir);

    expect(files).toHaveLength(EXPECTED_TASK_COUNT);
    for (const f of files) {
      expect(fs.existsSync(f)).toBe(true);
    }
  });

  it('files are placed in data/ipc/{group_folder}/tasks/', () => {
    const tasks = buildTaskDefinitions(VALID_CONFIG);
    const files = writeIpcFiles(tasks, tmpDir);

    for (const f of files) {
      const relative = path.relative(tmpDir, f);
      expect(relative).toMatch(/^ipc[/\\]main[/\\]tasks[/\\]/);
    }
  });

  it('each file contains valid JSON with correct IPC structure', () => {
    const tasks = buildTaskDefinitions(VALID_CONFIG);
    const files = writeIpcFiles(tasks, tmpDir);

    for (const f of files) {
      const raw = fs.readFileSync(f, 'utf-8');
      const parsed: IpcTaskFile = JSON.parse(raw);

      expect(parsed.type).toBe('schedule_task');
      expect(parsed.taskId).toBeTruthy();
      expect(parsed.prompt).toBeTruthy();
      expect(parsed.schedule_type).toBeTruthy();
      expect(parsed.schedule_value).toBeTruthy();
      expect(parsed.targetJid).toBeTruthy();
      expect(parsed.groupFolder).toBeTruthy();
    }
  });

  it('files are named after task IDs', () => {
    const tasks = buildTaskDefinitions(VALID_CONFIG);
    const files = writeIpcFiles(tasks, tmpDir);

    const fileNames = files.map((f) => path.basename(f));
    for (const task of tasks) {
      expect(fileNames).toContain(`${task.id}.json`);
    }
  });
});
