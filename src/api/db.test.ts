import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConnect = vi.fn();
const mockRunAndReadAll = vi.fn();
const mockInstanceCreate = vi.fn();

vi.mock('@duckdb/node-api', () => ({
  DuckDBInstance: {
    create: mockInstanceCreate,
  },
  DuckDBConnection: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  mockInstanceCreate.mockReset();
  mockConnect.mockReset();
  mockRunAndReadAll.mockReset();
  delete process.env.MOTHERDUCK_TOKEN;
});

function setupMocks() {
  mockRunAndReadAll.mockResolvedValue({
    columnNames: () => ['id'],
    getRows: () => [[1]],
  });
  mockConnect.mockResolvedValue({
    runAndReadAll: mockRunAndReadAll,
  });
  mockInstanceCreate.mockResolvedValue({
    connect: mockConnect,
  });
}

describe('db helper', () => {
  it('creates in-memory database when MOTHERDUCK_TOKEN is not set', async () => {
    setupMocks();
    const { getDb } = await import('./db.js');
    await getDb();
    expect(mockInstanceCreate).toHaveBeenCalledWith(':memory:');
  });

  it('creates MotherDuck database when token is set', async () => {
    process.env.MOTHERDUCK_TOKEN = 'test-token-123';
    setupMocks();
    const { getDb } = await import('./db.js');
    await getDb();
    expect(mockInstanceCreate).toHaveBeenCalledWith(
      'md:?motherduck_token=test-token-123',
    );
  });

  it('reuses existing database connection', async () => {
    setupMocks();
    const { getDb } = await import('./db.js');
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
    expect(mockInstanceCreate).toHaveBeenCalledTimes(1);
  });

  it('query() executes SQL and returns row objects', async () => {
    setupMocks();
    const { query } = await import('./db.js');
    const result = await query('SELECT id FROM test');
    expect(mockRunAndReadAll).toHaveBeenCalledWith(
      'SELECT id FROM test',
      undefined,
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  it('query() passes parameters to runAndReadAll', async () => {
    setupMocks();
    const { query } = await import('./db.js');
    await query('SELECT * FROM test WHERE id = $1', 1);
    expect(mockRunAndReadAll).toHaveBeenCalledWith(
      'SELECT * FROM test WHERE id = $1',
      [1],
    );
  });
});
