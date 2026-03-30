import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const exportRouter = Router();

const TABLE_NAMES = [
  'health_metrics',
  'supplements',
  'supplement_log',
  'recipes',
  'meal_plans',
  'calorie_log',
  'pantry',
  'preferences',
  'emails',
  'bills',
  'reminders',
] as const;

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

exportRouter.get('/health', async (req: Request, res: Response) => {
  const format = (req.query.format as string) || 'json';

  if (format !== 'csv' && format !== 'json') {
    res.status(400).json({ error: 'format must be "csv" or "json"' });
    return;
  }

  try {
    const rows = await query(
      `SELECT * FROM lifeos.health_metrics ORDER BY recorded_at DESC`,
    );

    if (format === 'csv') {
      const csv = toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="health_metrics.csv"',
      );
      res.send(csv);
    } else {
      res.json(rows);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

exportRouter.get('/all', async (req: Request, res: Response) => {
  const format = (req.query.format as string) || 'json';

  if (format !== 'json') {
    res.status(400).json({ error: 'format must be "json" for /all export' });
    return;
  }

  try {
    const results: Record<string, unknown[]> = {};

    const queries = TABLE_NAMES.map(async (table) => {
      try {
        const rows = await query(`SELECT * FROM lifeos.${table}`);
        return { table, rows };
      } catch {
        return { table, rows: [] };
      }
    });

    const settled = await Promise.all(queries);
    for (const { table, rows } of settled) {
      results[table] = rows;
    }

    res.json({
      exported_at: new Date().toISOString(),
      ...results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
