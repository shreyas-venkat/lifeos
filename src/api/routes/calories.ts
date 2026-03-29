import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const caloriesRouter = Router();

interface CalorieRow {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

interface MacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

function computeTotals(rows: CalorieRow[]): MacroTotals {
  return rows.reduce<MacroTotals>(
    (acc, row) => ({
      calories:
        acc.calories + (typeof row.calories === 'number' ? row.calories : 0),
      protein_g:
        acc.protein_g +
        (typeof row.protein_g === 'number' ? row.protein_g : 0),
      carbs_g:
        acc.carbs_g + (typeof row.carbs_g === 'number' ? row.carbs_g : 0),
      fat_g: acc.fat_g + (typeof row.fat_g === 'number' ? row.fat_g : 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

caloriesRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query<CalorieRow>(
      `SELECT id, meal_type, description, source, calories, protein_g, carbs_g, fat_g, fiber_g, created_at
       FROM lifeos.calorie_log
       WHERE log_date = CURRENT_DATE
       ORDER BY created_at ASC`,
    );

    const total = computeTotals(rows);
    res.json({ data: rows, total });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

caloriesRouter.get('/history', async (req: Request, res: Response) => {
  const daysParam = req.query.days;
  const days = daysParam ? Number(daysParam) : 7;

  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: 'days must be a number between 1 and 365' });
    return;
  }

  try {
    const rows = await query(
      `SELECT log_date,
              SUM(calories) AS calories,
              SUM(protein_g) AS protein_g,
              SUM(carbs_g) AS carbs_g,
              SUM(fat_g) AS fat_g,
              COUNT(*) AS entries
       FROM lifeos.calorie_log
       WHERE log_date >= CURRENT_DATE - INTERVAL '${String(days)}' DAY
       GROUP BY log_date
       ORDER BY log_date ASC`,
    );
    res.json({ data: rows, days });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message, days });
  }
});
