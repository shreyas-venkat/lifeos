import { afterEach, describe, expect, it } from 'vitest';

import {
  closeMotherDuck,
  execMotherDuck,
  getMotherDuckConnection,
  queryMotherDuck,
} from './motherduck.js';

afterEach(async () => {
  await closeMotherDuck();
});

describe('getMotherDuckConnection', () => {
  it('throws when MOTHERDUCK_TOKEN is missing and no override provided', async () => {
    const original = process.env.MOTHERDUCK_TOKEN;
    delete process.env.MOTHERDUCK_TOKEN;
    try {
      await expect(getMotherDuckConnection()).rejects.toThrow(
        'MOTHERDUCK_TOKEN environment variable is required',
      );
    } finally {
      if (original !== undefined) {
        process.env.MOTHERDUCK_TOKEN = original;
      }
    }
  });

  it('connects to in-memory DuckDB with override connection string', async () => {
    const conn = await getMotherDuckConnection(':memory:');
    expect(conn).toBeDefined();
  });

  it('returns the same connection on subsequent calls', async () => {
    const conn1 = await getMotherDuckConnection(':memory:');
    const conn2 = await getMotherDuckConnection(':memory:');
    expect(conn1).toBe(conn2);
  });
});

describe('queryMotherDuck', () => {
  it('returns row objects from a SELECT', async () => {
    const rows = await queryMotherDuck<{ answer: number }>(
      'SELECT 42 as answer',
      ':memory:',
    );
    expect(rows).toEqual([{ answer: 42 }]);
  });

  it('returns multiple rows', async () => {
    await execMotherDuck(
      'CREATE TABLE test_q (id INTEGER, name VARCHAR)',
      ':memory:',
    );
    await execMotherDuck("INSERT INTO test_q VALUES (1, 'alice'), (2, 'bob')");
    const rows = await queryMotherDuck<{ id: number; name: string }>(
      'SELECT * FROM test_q ORDER BY id',
    );
    expect(rows).toEqual([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ]);
  });
});

describe('execMotherDuck', () => {
  it('executes DDL without returning rows', async () => {
    await execMotherDuck(
      'CREATE TABLE test_exec (id INTEGER PRIMARY KEY)',
      ':memory:',
    );
    const rows = await queryMotherDuck(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'test_exec'",
    );
    expect(rows).toHaveLength(1);
  });
});

describe('closeMotherDuck', () => {
  it('cleans up and allows reconnection', async () => {
    await getMotherDuckConnection(':memory:');
    await closeMotherDuck();
    // After closing, a new connection should work
    const conn = await getMotherDuckConnection(':memory:');
    expect(conn).toBeDefined();
  });

  it('is safe to call when not connected', async () => {
    // Should not throw
    await closeMotherDuck();
  });
});
