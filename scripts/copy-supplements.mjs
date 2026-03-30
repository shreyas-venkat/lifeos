import crypto from 'crypto';
import { DuckDBInstance } from '@duckdb/node-api';

const token = process.env.MOTHERDUCK_TOKEN;
const inst = await DuckDBInstance.create(`md:?motherduck_token=${token}`);
const conn = await inst.connect();
await conn.run('USE my_db');

const data = await conn.runAndReadAll('SELECT name, dose_mg, dose_unit, timing FROM main.supplements');
let ok = 0;
for (const row of data.getRows()) {
  const id = crypto.randomUUID();
  const name = String(row[0]).replace(/'/g, "''");
  const raw = row[1];
  const dosage = raw && typeof raw === 'object' && 'value' in raw ? Number(raw.value) / 100 : (Number(raw) || 0);
  const unit = String(row[2]);
  const timing = String(row[3]);
  const sql = `INSERT INTO lifeos.supplements (id, name, default_dosage, unit, time_of_day, active) VALUES ('${id}', '${name}', ${dosage}, '${unit}', '${timing}', true)`;
  await conn.run(sql);
  ok++;
}
console.log(`Copied ${ok} supplements`);
const verify = await conn.runAndReadAll('SELECT name, default_dosage, unit, time_of_day FROM lifeos.supplements ORDER BY time_of_day, name');
verify.getRows().forEach(r => console.log(`  ${r[0]} ${r[1]} ${r[2]} (${r[3]})`));
