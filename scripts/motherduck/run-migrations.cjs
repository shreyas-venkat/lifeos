const { DuckDBInstance } = require('@duckdb/node-api');
const fs = require('fs');
const path = require('path');

(async () => {
  const token = process.env.MOTHERDUCK_TOKEN;
  if (!token) {
    console.log('MOTHERDUCK_TOKEN not set, skipping migrations');
    process.exit(0);
  }
  const inst = await DuckDBInstance.create('md:?motherduck_token=' + token);
  const conn = await inst.connect();
  await conn.run('USE my_db');
  const dir = path.join(__dirname, 'schemas');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    await conn.run(fs.readFileSync(path.join(dir, f), 'utf-8'));
    console.log('Migration OK:', f);
  }
  conn.closeSync();
  inst.closeSync();
})();
