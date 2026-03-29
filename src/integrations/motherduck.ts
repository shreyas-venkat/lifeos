import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

let instance: DuckDBInstance | null = null;
let conn: DuckDBConnection | null = null;

export async function getMotherDuckConnection(
  connectionString?: string,
): Promise<DuckDBConnection> {
  if (conn) return conn;
  const connStr = connectionString ?? buildConnectionString();
  instance = await DuckDBInstance.create(connStr);
  conn = await instance.connect();
  return conn;
}

export async function queryMotherDuck<
  T extends Record<string, unknown> = Record<string, unknown>,
>(sql: string, connectionString?: string): Promise<T[]> {
  const c = await getMotherDuckConnection(connectionString);
  const result = await c.runAndReadAll(sql);
  return result.getRowObjects() as T[];
}

export async function execMotherDuck(
  sql: string,
  connectionString?: string,
): Promise<void> {
  const c = await getMotherDuckConnection(connectionString);
  await c.run(sql);
}

export async function closeMotherDuck(): Promise<void> {
  if (conn) {
    conn.closeSync();
    conn = null;
  }
  if (instance) {
    instance.closeSync();
    instance = null;
  }
}

function buildConnectionString(): string {
  const token = process.env.MOTHERDUCK_TOKEN;
  if (!token) {
    throw new Error('MOTHERDUCK_TOKEN environment variable is required');
  }
  return `md:?motherduck_token=${token}`;
}
