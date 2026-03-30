#!/usr/bin/env node

/**
 * Import Samsung Health export data into MotherDuck my_db.lifeos.health_metrics.
 * Usage: MOTHERDUCK_TOKEN=... node scripts/import-samsung-health.mjs /path/to/samsung-health-dir
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DuckDBInstance } from '@duckdb/node-api';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node import-samsung-health.mjs <samsung-health-export-dir>');
  process.exit(1);
}

const token = process.env.MOTHERDUCK_TOKEN;
if (!token) {
  console.error('MOTHERDUCK_TOKEN env var required');
  process.exit(1);
}

function parseCSV(text) {
  const lines = text.split('\n');
  // Strip BOM
  if (lines[0] && lines[0].charCodeAt(0) === 0xFEFF) lines[0] = lines[0].slice(1);
  // Samsung Health CSVs have a metadata first line like "com.samsung.shealth.xxx,6313013,6"
  // The actual header is on line 2. Skip the metadata line.
  if (lines[0] && lines[0].startsWith('com.samsung')) lines.shift();
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    if (vals.length < 2) continue;
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j]?.trim() || null; });
    rows.push(row);
  }
  return rows;
}

function findFile(pattern) {
  const files = fs.readdirSync(dir);
  const match = files.find(f => f.includes(pattern) && f.endsWith('.csv'));
  return match ? path.join(dir, match) : null;
}

async function main() {
  const inst = await DuckDBInstance.create(`md:?motherduck_token=${token}`);
  const conn = await inst.connect();
  await conn.run('USE my_db');

  let total = 0;
  let errors = 0;

  async function insert(metric_type, value, recorded_at, unit = null) {
    if (total === 0 && errors === 0) console.log(`  First insert attempt: ${metric_type}=${value} at ${recorded_at}`);
    if (!value || isNaN(Number(value)) || !recorded_at) {
      if (errors === 0) console.log(`  Skipped: value=${value} (isNaN=${isNaN(Number(value))}), recorded_at=${recorded_at}`);
      return;
    }
    // Normalize timestamp: ensure ISO format
    if (recorded_at.includes(' ') && !recorded_at.includes('T')) {
      recorded_at = recorded_at.replace(' ', 'T');
    }
    const id = crypto.randomUUID();
    const unitVal = unit ? `'${unit}'` : 'NULL';
    const sql = `INSERT INTO my_db.lifeos.health_metrics (id, metric_type, value, unit, recorded_at, source, created_at) VALUES ('${id}', '${metric_type}', ${value}, ${unitVal}, '${recorded_at}', 'samsung_health', CURRENT_TIMESTAMP)`;
    try {
      await conn.run(sql);
      total++;
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`  Error [${metric_type}]: ${e.message.substring(0, 120)}`);
    }
  }

  // Steps (daily)
  const stepsFile = findFile('step_daily_trend');
  if (stepsFile) {
    console.log('Importing steps...');
    const rows = parseCSV(fs.readFileSync(stepsFile, 'utf-8'));
    let stepCount = 0;
    for (const row of rows) {
      const count = parseInt(row.count);
      const dayTime = row.day_time;
      if (!count || !dayTime) continue;
      const epochMs = parseInt(dayTime);
      if (isNaN(epochMs)) continue;
      const date = new Date(epochMs).toISOString();
      await insert('steps', count, date);
      stepCount++;
    }
    console.log(`  Steps: ${stepCount}/${rows.length} rows imported`);
  }

  // Heart rate
  const hrFile = findFile('tracker.heart_rate');
  if (hrFile) {
    console.log('Importing heart rate...');
    const rows = parseCSV(fs.readFileSync(hrFile, 'utf-8'));
    for (const row of rows) {
      const hr = parseFloat(row['com.samsung.health.heart_rate.heart_rate']);
      const time = row['com.samsung.health.heart_rate.start_time'];
      if (!hr || !time) continue;
      await insert('heart_rate', hr, time, 'bpm');
    }
    console.log(`  Heart rate: ${rows.length} rows processed`);
  }

  // Sleep
  const sleepFile = findFile('sleep_combined');
  if (sleepFile) {
    console.log('Importing sleep...');
    const rows = parseCSV(fs.readFileSync(sleepFile, 'utf-8'));
    for (const row of rows) {
      const duration = parseInt(row.sleep_duration);
      const startTime = row.start_time;
      const endTime = row.end_time;
      if (!duration || !endTime) continue;
      const hours = duration / 60; // duration is in minutes
      await insert('sleep_duration', hours.toFixed(1), endTime, 'hours');
    }
    console.log(`  Sleep: ${rows.length} rows processed`);
  }

  // SpO2
  const spo2File = findFile('tracker.oxygen_saturation');
  if (spo2File) {
    console.log('Importing SpO2...');
    const rows = parseCSV(fs.readFileSync(spo2File, 'utf-8'));
    for (const row of rows) {
      const spo2 = parseFloat(row['com.samsung.health.oxygen_saturation.spo2']);
      const time = row['com.samsung.health.oxygen_saturation.start_time'];
      if (!spo2 || !time) continue;
      await insert('spo2', spo2, time, '%');
      // Also import HR from SpO2 reading if available
      const hr = parseFloat(row['com.samsung.health.oxygen_saturation.heart_rate']);
      if (hr) await insert('heart_rate', hr, time, 'bpm');
    }
    console.log(`  SpO2: ${rows.length} rows processed`);
  }

  console.log(`\nDone! Imported ${total} metrics, ${errors} errors.`);
}

main().catch(e => { console.error(e); process.exit(1); });
