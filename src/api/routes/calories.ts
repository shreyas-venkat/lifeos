import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const caloriesRouter = Router();

caloriesRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT * FROM lifeos.calorie_log
       WHERE date = CURRENT_DATE
       ORDER BY meal_type, created_at ASC`,
    );

    const total = rows.reduce((sum, row) => {
      const cal = (row as Record<string, unknown>).calories;
      return sum + (typeof cal === 'number' ? cal : 0);
    }, 0);

    res.json({ data: rows, total_calories: total });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

caloriesRouter.get('/week', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT
         date,
         SUM(calories) AS total_calories,
         SUM(protein_g) AS total_protein_g,
         SUM(carbs_g) AS total_carbs_g,
         SUM(fat_g) AS total_fat_g,
         COUNT(*) AS entries
       FROM lifeos.calorie_log
       WHERE date >= CURRENT_DATE - INTERVAL 7 DAY
       GROUP BY date
       ORDER BY date ASC`,
    );

    const weekTotal = rows.reduce((sum, row) => {
      const cal = (row as Record<string, unknown>).total_calories;
      return sum + (typeof cal === 'number' ? cal : 0);
    }, 0);

    res.json({ data: rows, week_total_calories: weekTotal });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
