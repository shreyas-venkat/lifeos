import { describe, it, expect } from 'vitest';
import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.join(__dirname, 'schemas');

const EXPECTED_TABLES = [
  'bills',
  'calendar_events',
  'calorie_log',
  'dietary_preferences',
  'email_deletion_log',
  'emails',
  'exercise_log',
  'exercise_templates',
  'fitness_log',
  'fitness_nudges',
  'grocery_lists',
  'habit_log',
  'habits',
  'health_metrics',
  'meal_plans',
  'mood_log',
  'notifications',
  'packages',
  'pantry',
  'preferences',
  'recipe_favorites',
  'recipes',
  'reminders',
  'streaks',
  'subscriptions',
  'supplement_log',
  'supplements',
  'transactions',
  'water_log',
];

async function applyAllSchemas() {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  const sqlFiles = fs
    .readdirSync(schemasDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();
  for (const file of sqlFiles) {
    const sql = fs.readFileSync(path.join(schemasDir, file), 'utf-8');
    await conn.run(sql);
  }
  return { instance, conn };
}

describe('runMigrations', () => {
  it('reads and applies SQL files in sorted order', async () => {
    const sqlFiles = fs
      .readdirSync(schemasDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();
    const { applied, errors } = await runMigrations(':memory:');
    expect(errors).toEqual([]);
    expect(applied).toEqual(sqlFiles);
  });

  it('is idempotent — running twice produces no errors', async () => {
    const instance = await DuckDBInstance.create(':memory:');
    const conn = await instance.connect();
    const sqlFiles = fs
      .readdirSync(schemasDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();
    for (const file of sqlFiles) {
      const sql = fs.readFileSync(path.join(schemasDir, file), 'utf-8');
      await conn.run(sql);
    }
    // Run again — should not error
    for (const file of sqlFiles) {
      const sql = fs.readFileSync(path.join(schemasDir, file), 'utf-8');
      await conn.run(sql);
    }
    conn.closeSync();
    instance.closeSync();
  });
});

describe('schema tables', () => {
  it('creates all expected tables in the lifeos schema', async () => {
    const { conn, instance } = await applyAllSchemas();
    const result = await conn.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'lifeos' ORDER BY table_name",
    );
    const tableNames = result
      .getRows()
      .map((r) => String(r[0]))
      .sort();

    expect(tableNames).toEqual(EXPECTED_TABLES);

    conn.closeSync();
    instance.closeSync();
  });

  it('emails table has expected columns', async () => {
    const { conn, instance } = await applyAllSchemas();
    const result = await conn.runAndReadAll(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'lifeos' AND table_name = 'emails' ORDER BY ordinal_position",
    );
    const cols = result.getRows().map((r) => String(r[0]));
    expect(cols).toContain('id');
    expect(cols).toContain('sender');
    expect(cols).toContain('subject');
    expect(cols).toContain('category');
    conn.closeSync();
    instance.closeSync();
  });

  it('recipes table has expected columns including JSON and array types', async () => {
    const { conn, instance } = await applyAllSchemas();
    const result = await conn.runAndReadAll(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'lifeos' AND table_name = 'recipes' ORDER BY ordinal_position",
    );
    const cols = result.getRows().map((r) => String(r[0]));
    expect(cols).toContain('ingredients');
    expect(cols).toContain('macros');
    expect(cols).toContain('tags');
    conn.closeSync();
    instance.closeSync();
  });

  it('bills table has expected columns', async () => {
    const { conn, instance } = await applyAllSchemas();
    const result = await conn.runAndReadAll(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'lifeos' AND table_name = 'bills' ORDER BY ordinal_position",
    );
    const cols = result.getRows().map((r) => String(r[0]));
    expect(cols).toContain('amount');
    expect(cols).toContain('merchant');
    expect(cols).toContain('due_date');
    conn.closeSync();
    instance.closeSync();
  });

  it('supplement_log table has expected columns', async () => {
    const { conn, instance } = await applyAllSchemas();
    const result = await conn.runAndReadAll(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'lifeos' AND table_name = 'supplement_log' ORDER BY ordinal_position",
    );
    const cols = result.getRows().map((r) => String(r[0]));
    expect(cols).toContain('supplement_id');
    expect(cols).toContain('taken');
    expect(cols).toContain('log_date');
    conn.closeSync();
    instance.closeSync();
  });

  it('transactions table has expected columns', async () => {
    const { conn, instance } = await applyAllSchemas();
    const result = await conn.runAndReadAll(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'lifeos' AND table_name = 'transactions' ORDER BY ordinal_position",
    );
    const cols = result.getRows().map((r) => String(r[0]));
    expect(cols).toContain('amount');
    expect(cols).toContain('merchant');
    expect(cols).toContain('category');
    expect(cols).toContain('transaction_date');
    conn.closeSync();
    instance.closeSync();
  });

  it('preferences table has composite primary key columns', async () => {
    const { conn, instance } = await applyAllSchemas();
    const result = await conn.runAndReadAll(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'lifeos' AND table_name = 'preferences' ORDER BY ordinal_position",
    );
    const cols = result.getRows().map((r) => String(r[0]));
    expect(cols).toContain('key');
    expect(cols).toContain('value');
    expect(cols).toContain('skill');
    conn.closeSync();
    instance.closeSync();
  });
});
