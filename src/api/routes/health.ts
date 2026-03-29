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
  } catch (_err: unknown) {
    res.json({ data: [] });
  }
});

healthRouter.get('/trends', async (req: Request, res: Response) => {
  const daysParam = req.query.days;
  const days = daysParam ? Number(daysParam) : 30;

  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: 'days must be a number between 1 and 365' });
    return;
  }

  try {
    const rows = await query(
      `SELECT
         metric_type,
         CAST(recorded_at AS DATE) AS date,
         AVG(value) AS avg_value,
         COUNT(*) AS entries
       FROM lifeos.health_metrics
       WHERE recorded_at >= CURRENT_DATE - INTERVAL '${days}' DAY
       GROUP BY metric_type, CAST(recorded_at AS DATE)
       ORDER BY date ASC`,
    );
    res.json({ data: rows, days });
  } catch (_err: unknown) {
    res.json({ data: [], days });
  }
});
