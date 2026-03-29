import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT metric_type, value, unit, recorded_at
       FROM lifeos.health_metrics
       WHERE recorded_at >= CURRENT_DATE
       ORDER BY recorded_at DESC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

const VALID_METRICS = new Set([
  'steps',
  'heart_rate',
  'hrv',
  'spo2',
  'weight',
  'sleep_duration',
  'all',
]);

healthRouter.get('/history', async (req: Request, res: Response) => {
  const daysParam = req.query.days;
  const days = daysParam ? Number(daysParam) : 7;
  const metric = (req.query.metric as string) || 'all';

  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: 'days must be a number between 1 and 365' });
    return;
  }

  if (!VALID_METRICS.has(metric)) {
    res.status(400).json({
      error: `metric must be one of: ${[...VALID_METRICS].join(', ')}`,
    });
    return;
  }

  try {
    const sql =
      metric === 'all'
        ? `SELECT CAST(recorded_at AS DATE) AS date, metric_type,
                  AVG(value) AS avg_value, MIN(value) AS min_value,
                  MAX(value) AS max_value, COUNT(*) AS readings
           FROM lifeos.health_metrics
           WHERE recorded_at >= CURRENT_DATE - INTERVAL '${String(days)}' DAY
           GROUP BY CAST(recorded_at AS DATE), metric_type
           ORDER BY date ASC, metric_type`
        : `SELECT CAST(recorded_at AS DATE) AS date, metric_type,
                  AVG(value) AS avg_value, MIN(value) AS min_value,
                  MAX(value) AS max_value, COUNT(*) AS readings
           FROM lifeos.health_metrics
           WHERE recorded_at >= CURRENT_DATE - INTERVAL '${String(days)}' DAY
             AND metric_type = $1
           GROUP BY CAST(recorded_at AS DATE), metric_type
           ORDER BY date ASC, metric_type`;

    const rows =
      metric === 'all' ? await query(sql) : await query(sql, metric);
    res.json({ data: rows, days });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message, days });
  }
});
