#!/bin/bash
# Pre-check: only wake agent if bills are due within 3 days
# Requires node with duckdb-async
RESULT=$(node -e "
const { Database } = require('duckdb-async');
(async () => {
  const db = await Database.create('md:?motherduck_token=' + process.env.MOTHERDUCK_TOKEN);
  const rows = await db.all(\"SELECT count(*) as c FROM lifeos.bills WHERE due_date <= CURRENT_DATE + INTERVAL '3 days' AND due_date >= CURRENT_DATE AND status = 'upcoming'\");
  const count = rows[0]?.c || 0;
  console.log(JSON.stringify({ wakeAgent: count > 0, data: { dueBills: count } }));
  await db.close();
})().catch(() => console.log(JSON.stringify({ wakeAgent: false })));
" 2>/dev/null)
echo "${RESULT:-{\"wakeAgent\":false}}"
