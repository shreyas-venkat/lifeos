#!/bin/bash
# Pre-check: only wake agent if pantry items are expiring soon
# Requires node with duckdb-async
RESULT=$(node -e "
const { Database } = require('duckdb-async');
(async () => {
  const db = await Database.create('md:?motherduck_token=' + process.env.MOTHERDUCK_TOKEN);
  const rows = await db.all(\"SELECT count(*) as c FROM lifeos.pantry WHERE expiry_date <= CURRENT_DATE + INTERVAL '3 days' AND expiry_date >= CURRENT_DATE\");
  const count = rows[0]?.c || 0;
  console.log(JSON.stringify({ wakeAgent: count > 0, data: { expiringCount: count } }));
  await db.close();
})().catch(() => console.log(JSON.stringify({ wakeAgent: false })));
" 2>/dev/null)
echo "${RESULT:-{\"wakeAgent\":false}}"
