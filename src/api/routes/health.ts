import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT * FROM lifeos.health_metrics
       WHERE date = CURRENT_DATE
       ORDER BY created_at DESC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
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
         date,
         AVG(weight_kg) AS avg_weight_kg,
         AVG(body_fat_pct) AS avg_body_fat_pct,
         AVG(resting_hr) AS avg_resting_hr,
         AVG(sleep_hours) AS avg_sleep_hours,
         COUNT(*) AS entries
       FROM lifeos.health_metrics
       WHERE date >= CURRENT_DATE - INTERVAL ($1) DAY
       GROUP BY date
       ORDER BY date ASC`,
      days,
    );
    res.json({ data: rows, days });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
