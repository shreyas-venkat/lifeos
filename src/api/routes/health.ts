import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    // Aggregate today's metrics intelligently per type:
    // - steps: SUM (each reading is an interval, not cumulative)
    // - sleep_duration: MAX (ignore 0s from failed inserts)
    // - heart_rate, spo2, hrv: latest reading
    // - weight: latest reading
    // Also normalize oxygen_saturation → spo2
    const rows = await query(
      `WITH normalized AS (
         SELECT
           CASE WHEN metric_type = 'oxygen_saturation' THEN 'spo2' ELSE metric_type END AS metric_type,
           value, unit, recorded_at
         FROM lifeos.health_metrics
         WHERE recorded_at >= CURRENT_DATE
       ),
       steps_deduped AS (
         SELECT metric_type, recorded_at, MAX(value) AS value, MAX(unit) AS unit
         FROM normalized
         WHERE metric_type = 'steps'
         GROUP BY metric_type, recorded_at
       ),
       summed AS (
         SELECT metric_type, SUM(value) AS value, MAX(unit) AS unit, MAX(recorded_at) AS recorded_at
         FROM steps_deduped
         GROUP BY metric_type
       ),
       maxed AS (
         SELECT metric_type, MAX(value) AS value, MAX(unit) AS unit, MAX(recorded_at) AS recorded_at
         FROM normalized
         WHERE metric_type = 'sleep_duration' AND value > 0
         GROUP BY metric_type
       ),
       ranked AS (
         SELECT metric_type, value, unit, recorded_at,
                ROW_NUMBER() OVER (PARTITION BY metric_type ORDER BY recorded_at DESC) AS rn
         FROM normalized
         WHERE metric_type NOT IN ('steps', 'sleep_duration')
       ),
       latest AS (
         SELECT metric_type, value, unit, recorded_at
         FROM ranked WHERE rn = 1
       )
       SELECT * FROM summed
       UNION ALL SELECT * FROM maxed
       UNION ALL SELECT * FROM latest`,
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

    const rows = metric === 'all' ? await query(sql) : await query(sql, metric);
    res.json({ data: rows, days });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message, days });
  }
});
