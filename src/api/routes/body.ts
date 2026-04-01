import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const bodyRouter = Router();

const BODY_METRICS = [
  'weight',
  'bmi',
  'body_fat',
  'muscle_mass',
  'body_water',
  'bmr',
] as const;

const BODY_METRICS_SET = new Set<string>(BODY_METRICS);
const BODY_METRICS_SQL = BODY_METRICS.map((m) => `'${m}'`).join(', ');

bodyRouter.get('/latest', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT metric_type, value, unit, recorded_at
       FROM (
         SELECT metric_type, value, unit, recorded_at,
                ROW_NUMBER() OVER (PARTITION BY metric_type ORDER BY recorded_at DESC) AS rn
         FROM lifeos.health_metrics
         WHERE metric_type IN (${BODY_METRICS_SQL})
       ) ranked
       WHERE rn = 1
       ORDER BY metric_type`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

bodyRouter.get('/history', async (req: Request, res: Response) => {
  const daysParam = req.query.days;
  const days = daysParam ? Number(daysParam) : 90;

  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: 'days must be a number between 1 and 365' });
    return;
  }

  try {
    const rows = await query(
      `SELECT CAST(recorded_at AS DATE) AS date, metric_type, AVG(value) AS avg_value
       FROM lifeos.health_metrics
       WHERE metric_type IN (${BODY_METRICS_SQL})
         AND recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
       GROUP BY CAST(recorded_at AS DATE), metric_type
       ORDER BY date ASC`,
    );
    res.json({ data: rows, days });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message, days });
  }
});

interface LogBody {
  weight_kg?: unknown;
  body_fat_pct?: unknown;
  muscle_mass_pct?: unknown;
  body_water_pct?: unknown;
  notes?: unknown;
}

const FIELD_MAP: { field: keyof LogBody; metric: string; unit: string }[] = [
  { field: 'weight_kg', metric: 'weight', unit: 'kg' },
  { field: 'body_fat_pct', metric: 'body_fat', unit: '%' },
  { field: 'muscle_mass_pct', metric: 'muscle_mass', unit: '%' },
  { field: 'body_water_pct', metric: 'body_water', unit: '%' },
];

bodyRouter.post('/log', async (req: Request, res: Response) => {
  const body = req.body as LogBody;

  const entries: { metric: string; value: number; unit: string }[] = [];

  for (const { field, metric, unit } of FIELD_MAP) {
    const raw = body[field];
    if (raw === undefined || raw === null) continue;

    const value = Number(raw);
    if (isNaN(value)) {
      res.status(400).json({ error: `${field} must be a number` });
      return;
    }
    entries.push({ metric, value, unit });
  }

  if (entries.length === 0) {
    res.status(400).json({
      error:
        'At least one body metric required: weight_kg, body_fat_pct, muscle_mass_pct, body_water_pct',
    });
    return;
  }

  try {
    const now = new Date().toISOString();

    for (const entry of entries) {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.health_metrics (id, metric_type, value, unit, recorded_at, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        id,
        entry.metric,
        entry.value,
        entry.unit,
        now,
        'manual',
      );
    }

    res.json({ accepted: entries.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
