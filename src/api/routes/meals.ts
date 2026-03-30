import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const mealsRouter = Router();

mealsRouter.get('/plan', async (req: Request, res: Response) => {
  const week = (req.query.week as string) || 'current';

  if (week !== 'current' && week !== 'next') {
    res.status(400).json({ error: 'week must be "current" or "next"' });
    return;
  }

  try {
    // Match meal plans where week_start falls within the target week
    // Flexible: handles both Monday and Sunday as week start
    const weekFilter =
      week === 'current'
        ? `mp.week_start BETWEEN CURRENT_DATE - INTERVAL '6' DAY AND CURRENT_DATE + INTERVAL '6' DAY`
        : `mp.week_start BETWEEN CURRENT_DATE + INTERVAL '1' DAY AND CURRENT_DATE + INTERVAL '13' DAY`;

    const rows = await query(
      `SELECT mp.id, mp.week_start, mp.day_of_week, mp.meal_type, mp.status,
              mp.notes, mp.servings,
              r.name AS recipe_name, r.calories_per_serving,
              r.prep_time_min, r.cook_time_min
       FROM lifeos.meal_plans mp
       LEFT JOIN lifeos.recipes r ON mp.recipe_id = r.id
       WHERE ${weekFilter}
       ORDER BY mp.day_of_week, mp.meal_type`,
    );

    const weekStart =
      rows.length > 0 ? (rows[0] as Record<string, unknown>).week_start : null;

    res.json({ data: rows, week_start: weekStart });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

mealsRouter.post('/plan/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status?: string };

  if (!status || !['planned', 'cooked', 'skipped', 'ate_out'].includes(status)) {
    res
      .status(400)
      .json({ error: 'status must be one of: planned, cooked, skipped, ate_out' });
    return;
  }

  try {
    await query(
      `UPDATE lifeos.meal_plans SET status = $1 WHERE id = $2`,
      status,
      id,
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

mealsRouter.get('/recipes', async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  const limitParam = req.query.limit;
  const limit = limitParam ? Number(limitParam) : 20;

  if (isNaN(limit) || limit < 1 || limit > 100) {
    res.status(400).json({ error: 'limit must be a number between 1 and 100' });
    return;
  }

  try {
    const sql = search
      ? `SELECT id, name, calories_per_serving, rating, times_cooked, prep_time_min, cook_time_min, servings, tags
         FROM lifeos.recipes
         WHERE name ILIKE '%' || $1 || '%'
         ORDER BY rating DESC NULLS LAST, times_cooked DESC
         LIMIT ${String(limit)}`
      : `SELECT id, name, calories_per_serving, rating, times_cooked, prep_time_min, cook_time_min, servings, tags
         FROM lifeos.recipes
         ORDER BY rating DESC NULLS LAST, times_cooked DESC
         LIMIT ${String(limit)}`;

    const rows = search ? await query(sql, search) : await query(sql);
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

mealsRouter.get('/recipes/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const rows = await query(
      `SELECT *
       FROM lifeos.recipes
       WHERE id = $1`,
      id,
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }

    res.json({ data: rows[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

mealsRouter.post('/recipes/:id/rate', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { rating } = req.body as { rating?: number };

  if (rating === undefined || typeof rating !== 'number') {
    res.status(400).json({ error: 'rating is required and must be a number' });
    return;
  }

  if (rating < 1 || rating > 5) {
    res.status(400).json({ error: 'rating must be between 1 and 5' });
    return;
  }

  try {
    await query(
      `UPDATE lifeos.recipes SET rating = $1 WHERE id = $2`,
      rating,
      id,
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
