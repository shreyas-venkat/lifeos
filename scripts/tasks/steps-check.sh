#!/bin/bash
# Pre-check: only wake agent if avg steps < 5000 over last 3 days
# Requires node with duckdb-async
RESULT=$(node -e "
const { Database } = require('duckdb-async');
(async () => {
  const db = await Database.create('md:?motherduck_token=' + process.env.MOTHERDUCK_TOKEN);
  const rows = await db.all(\"SELECT AVG(value) as avg_steps FROM lifeos.health_metrics WHERE metric_type = 'steps' AND recorded_at >= now() - INTERVAL '3 days'\");
  const avg = rows[0]?.avg_steps || 0;
  console.log(JSON.stringify({ wakeAgent: avg < 5000, data: { avgSteps: Math.round(avg) } }));
  await db.close();
})().catch(() => console.log(JSON.stringify({ wakeAgent: false })));
" 2>/dev/null)
echo "${RESULT:-{\"wakeAgent\":false}}"
