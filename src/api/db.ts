import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

let instance: DuckDBInstance | null = null;
let conn: DuckDBConnection | null = null;

export async function getDb(): Promise<DuckDBConnection> {
  if (conn) return conn;
  const token = process.env.MOTHERDUCK_TOKEN;
  const connStr = token ? `md:?motherduck_token=${token}` : ':memory:';
  instance = await DuckDBInstance.create(connStr);
  conn = await instance.connect();
  return conn;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  ..._params: unknown[]
): Promise<T[]> {
  const connection = await getDb();
  const result = await connection.runAndReadAll(sql);
  const columns = result.columnNames();
  return result.getRows().map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  }) as T[];
}
