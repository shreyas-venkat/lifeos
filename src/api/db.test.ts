import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockAll = vi.fn();

vi.mock('duckdb-async', () => ({
  Database: {
    create: mockCreate,
  },
}));

beforeEach(() => {
  vi.resetModules();
  mockCreate.mockReset();
  mockAll.mockReset();
  delete process.env.MOTHERDUCK_TOKEN;
});

describe('db helper', () => {
  it('creates in-memory database when MOTHERDUCK_TOKEN is not set', async () => {
    mockCreate.mockResolvedValue({ all: mockAll });
    const { getDb } = await import('./db.js');
    await getDb();
    expect(mockCreate).toHaveBeenCalledWith(':memory:');
  });

  it('creates MotherDuck database when token is set', async () => {
    process.env.MOTHERDUCK_TOKEN = 'test-token-123';
    mockCreate.mockResolvedValue({ all: mockAll });
    const { getDb } = await import('./db.js');
    await getDb();
    expect(mockCreate).toHaveBeenCalledWith(
      'md:?motherduck_token=test-token-123',
    );
  });

  it('reuses existing database connection', async () => {
    mockCreate.mockResolvedValue({ all: mockAll });
    const { getDb } = await import('./db.js');
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('query() executes SQL with parameters', async () => {
    mockAll.mockResolvedValue([{ id: 1 }]);
    mockCreate.mockResolvedValue({ all: mockAll });
    const { query } = await import('./db.js');
    const result = await query('SELECT * FROM test WHERE id = $1', 1);
    expect(mockAll).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', 1);
    expect(result).toEqual([{ id: 1 }]);
  });
});
