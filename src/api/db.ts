import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import type { DuckDBValue } from '@duckdb/node-api';

let connPromise: Promise<DuckDBConnection> | null = null;

export async function getDb(): Promise<DuckDBConnection> {
  if (!connPromise) {
    connPromise = (async () => {
      const token = process.env.MOTHERDUCK_TOKEN;
      const connStr = token ? `md:?motherduck_token=${token}` : ':memory:';
      const instance = await DuckDBInstance.create(connStr);
      const conn = await instance.connect();
      if (token) {
        await conn.run('USE my_db');
      }
      return conn;
    })();
  }
  return connPromise;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const connection = await getDb();
  const values = params.length > 0 ? (params as DuckDBValue[]) : undefined;
  const result = await connection.runAndReadAll(sql, values);
  const columns = result.columnNames();
  return result.getRows().map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      const val = row[i];
      if (typeof val === 'bigint') {
        obj[col] = Number(val);
      } else if (val && typeof val === 'object' && 'micros' in val) {
        // DuckDB TIMESTAMP → ISO string (micros since epoch)
        obj[col] = new Date(
          Number(BigInt(val.micros as bigint) / 1000n),
        ).toISOString();
      } else if (val && typeof val === 'object' && 'days' in val) {
        // DuckDB DATE → ISO date string (days since epoch)
        const d = new Date(Number(val.days as number) * 86400000);
        obj[col] = d.toISOString().split('T')[0];
      } else {
        obj[col] = val;
      }
    });
    return obj;
  }) as T[];
}
