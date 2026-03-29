import { Database } from 'duckdb-async';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;
  const token = process.env.MOTHERDUCK_TOKEN;
  if (!token) {
    db = await Database.create(':memory:');
  } else {
    db = await Database.create(`md:?motherduck_token=${token}`);
  }
  return db;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const conn = await getDb();
  return conn.all(sql, ...params) as Promise<T[]>;
}
