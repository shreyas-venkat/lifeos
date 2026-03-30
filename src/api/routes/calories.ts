import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

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
        acc.protein_g + (typeof row.protein_g === 'number' ? row.protein_g : 0),
      carbs_g:
        acc.carbs_g + (typeof row.carbs_g === 'number' ? row.carbs_g : 0),
      fat_g: acc.fat_g + (typeof row.fat_g === 'number' ? row.fat_g : 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

caloriesRouter.post('/log', async (req: Request, res: Response) => {
  const { meal_type, description, calories, protein_g, carbs_g, fat_g } =
    req.body as Record<string, unknown>;

  if (!meal_type || typeof meal_type !== 'string') {
    res
      .status(400)
      .json({ error: 'meal_type is required and must be a string' });
    return;
  }
  if (!description || typeof description !== 'string') {
    res
      .status(400)
      .json({ error: 'description is required and must be a string' });
    return;
  }

  try {
    const cal = calories !== undefined ? Number(calories) : null;
    const pro = protein_g !== undefined ? Number(protein_g) : null;
    const carb = carbs_g !== undefined ? Number(carbs_g) : null;
    const fat = fat_g !== undefined ? Number(fat_g) : null;

    // Check for existing entry with same meal_type on the same day (upsert)
    const existing = await query(
      `SELECT id FROM lifeos.calorie_log
       WHERE meal_type = $1 AND log_date = CURRENT_DATE
       LIMIT 1`,
      meal_type,
    );

    if (existing.length > 0) {
      const existingId = (existing[0] as Record<string, unknown>).id as string;
      await query(
        `UPDATE lifeos.calorie_log
         SET description = $1, calories = $2, protein_g = $3, carbs_g = $4, fat_g = $5, source = 'manual'
         WHERE id = $6`,
        description,
        cal,
        pro,
        carb,
        fat,
        existingId,
      );
      res.json({ success: true, id: existingId, updated: true });
    } else {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.calorie_log (id, meal_type, description, calories, protein_g, carbs_g, fat_g, log_date, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, 'manual')`,
        id,
        meal_type,
        description,
        cal,
        pro,
        carb,
        fat,
      );
      res.json({ success: true, id });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

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
