import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

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
  'fitness_log',
  'fitness_nudges',
  'grocery_lists',
  'health_metrics',
  'meal_plans',
  'pantry',
  'preferences',
  'recipes',
  'reminders',
  'supplement_log',
  'supplements',
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
    const { applied, errors } = await runMigrations(':memory:');
    expect(errors).toEqual([]);
    expect(applied).toEqual([
      '001_phase1_foundation.sql',
      '002_phase2_meals.sql',
      '003_phase3_health.sql',
      '004_phase5_bills.sql',
    ]);
  });

  it('is idempotent — running twice produces no errors', async () => {
    const { instance, conn } = await applyAllSchemas();

    // Second pass — should not error because of IF NOT EXISTS
    const sqlFiles = fs
      .readdirSync(schemasDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();
    for (const file of sqlFiles) {
      const sql = fs.readFileSync(path.join(schemasDir, file), 'utf-8');
      await conn.run(sql);
    }

    // If we reach here without throwing, idempotency holds
    conn.closeSync();
    instance.closeSync();
  });
});

describe('schema tables', () => {
  it('creates all 17 expected tables in the lifeos schema', async () => {
    const { instance, conn } = await applyAllSchemas();

    const result = await conn.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'lifeos' ORDER BY table_name",
    );
    const tableNames = result
      .getRowObjects()
      .map((r: Record<string, unknown>) => r.table_name as string)
      .sort();

    expect(tableNames).toEqual(EXPECTED_TABLES);

    conn.closeSync();
    instance.closeSync();
  });
});

describe('schema columns', () => {
  async function getColumns(
    tableName: string,
  ): Promise<
    { column_name: string; data_type: string; is_nullable: string }[]
  > {
    const { instance, conn } = await applyAllSchemas();

    const result = await conn.runAndReadAll(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'lifeos' AND table_name = '${tableName}'
       ORDER BY ordinal_position`,
    );
    const rows = result.getRowObjects() as {
      column_name: string;
      data_type: string;
      is_nullable: string;
    }[];

    conn.closeSync();
    instance.closeSync();
    return rows;
  }

  it('emails table has expected columns', async () => {
    const cols = await getColumns('emails');
    const names = cols.map((c) => c.column_name);
    expect(names).toContain('id');
    expect(names).toContain('provider');
    expect(names).toContain('sender');
    expect(names).toContain('category');
    expect(names).toContain('action_taken');
    expect(names).toContain('importance');
    expect(names).toContain('snippet');
    expect(names).toContain('processed_at');
  });

  it('recipes table has expected columns including JSON and array types', async () => {
    const cols = await getColumns('recipes');
    const names = cols.map((c) => c.column_name);
    expect(names).toContain('ingredients');
    expect(names).toContain('macros');
    expect(names).toContain('tags');
    expect(names).toContain('calories_per_serving');
    expect(names).toContain('times_cooked');
  });

  it('bills table has expected columns', async () => {
    const cols = await getColumns('bills');
    const names = cols.map((c) => c.column_name);
    expect(names).toContain('id');
    expect(names).toContain('name');
    expect(names).toContain('amount');
    expect(names).toContain('due_date');
    expect(names).toContain('recurring');
    expect(names).toContain('status');
    expect(names).toContain('source_email_id');
  });

  it('supplement_log table has expected columns', async () => {
    const cols = await getColumns('supplement_log');
    const names = cols.map((c) => c.column_name);
    expect(names).toContain('supplement_id');
    expect(names).toContain('recommended_dosage');
    expect(names).toContain('taken');
    expect(names).toContain('log_date');
    expect(names).toContain('time_of_day');
  });

  it('preferences table has composite primary key columns', async () => {
    const cols = await getColumns('preferences');
    const names = cols.map((c) => c.column_name);
    expect(names).toContain('key');
    expect(names).toContain('value');
    expect(names).toContain('skill');
  });
});
