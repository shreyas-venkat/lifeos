import {
  MDConnection,
  type MaterializedQueryResult,
} from '@motherduck/wasm-client';
import type { DuckDBValue } from '@motherduck/wasm-client';

let connPromise: Promise<MDConnection> | null = null;

export function getDb(): Promise<MDConnection> {
  if (!connPromise) {
    connPromise = (async () => {
      const token = import.meta.env.VITE_MOTHERDUCK_TOKEN;
      if (!token) {
        throw new Error(
          'VITE_MOTHERDUCK_TOKEN is not set. Add it to .env or .env.local.',
        );
      }
      const conn = MDConnection.create({ mdToken: token });
      await conn.isInitialized();
      await conn.evaluateQuery('USE my_db');
      return conn;
    })();
  }
  return connPromise;
}

/**
 * Normalize a single DuckDB value to a plain JS type.
 *
 * Mirrors the logic in src/api/db.ts (the Node.js version) so the PWA
 * receives identical data shapes regardless of which path produced them.
 *
 * - bigint -> number
 * - TIMESTAMP (microseconds since epoch) -> ISO string
 * - TIMESTAMP_TZ (microseconds since epoch) -> ISO string
 * - DATE (days since epoch) -> YYYY-MM-DD string
 * - everything else -> pass-through
 */
function normalizeValue(val: DuckDBValue): unknown {
  if (typeof val === 'bigint') {
    return Number(val);
  }

  if (val && typeof val === 'object') {
    // DuckDB TIMESTAMP / TIMESTAMP_TZ -> ISO string (microseconds since epoch)
    if ('microseconds' in val) {
      return new Date(
        Number(BigInt(val.microseconds as bigint) / 1000n),
      ).toISOString();
    }
    // DuckDB DATE -> YYYY-MM-DD string (days since epoch)
    if ('days' in val) {
      const d = new Date(Number(val.days as number) * 86400000);
      return d.toISOString().split('T')[0];
    }
  }

  return val;
}

function materializeRows<T>(result: MaterializedQueryResult): T[] {
  const { data } = result;
  const columns = data.columnNames();
  const rows: T[] = [];
  for (let r = 0; r < data.rowCount; r++) {
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < columns.length; c++) {
      obj[columns[c]] = normalizeValue(data.value(c, r));
    }
    rows.push(obj as T);
  }
  return rows;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const conn = await getDb();
  const result =
    params.length > 0
      ? await conn.evaluatePreparedStatement(sql, params)
      : await conn.evaluateQuery(sql);
  return materializeRows<T>(result);
}

export async function queryOrDefault<T>(
  sql: string,
  fallback: T,
  ...params: unknown[]
): Promise<T> {
  const rows = await query<T>(sql, ...params);
  return rows.length > 0 ? rows[0] : fallback;
}
