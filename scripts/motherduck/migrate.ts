import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(
  connectionString?: string,
): Promise<{ applied: string[]; errors: string[] }> {
  const connStr =
    connectionString || `md:?motherduck_token=${process.env.MOTHERDUCK_TOKEN}`;
  const instance = await DuckDBInstance.create(connStr);
  const conn = await instance.connect();

  // IMPORTANT: Set default database to my_db on MotherDuck.
  // Without this, CREATE SCHEMA lifeos creates a DATABASE named lifeos
  // instead of a schema inside my_db, causing ambiguous reference errors.
  if (!connectionString || connectionString.startsWith('md:')) {
    await conn.run('USE my_db');
  }

  const schemasDir = path.join(__dirname, 'schemas');
  const sqlFiles = fs
    .readdirSync(schemasDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const errors: string[] = [];

  for (const file of sqlFiles) {
    const sql = fs.readFileSync(path.join(schemasDir, file), 'utf-8');
    try {
      await conn.run(sql);
      applied.push(file);
    } catch (err: unknown) {
      errors.push(`${file}: ${(err as Error).message}`);
    }
  }

  conn.closeSync();
  instance.closeSync();
  return { applied, errors };
}

// CLI entry point
if (process.argv[1] && process.argv[1].includes('migrate')) {
  runMigrations()
    .then(({ applied, errors }) => {
      console.log(`Applied ${applied.length} migrations`);
      applied.forEach((f) => console.log(`  + ${f}`));
      if (errors.length) {
        console.error(`${errors.length} errors:`);
        errors.forEach((e) => console.error(`  ! ${e}`));
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
