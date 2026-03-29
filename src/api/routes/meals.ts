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
    const weekFilter =
      week === 'current'
        ? `date_trunc('week', CURRENT_DATE)`
        : `date_trunc('week', CURRENT_DATE) + INTERVAL 7 DAY`;

    const rows = await query(
      `SELECT mp.*, r.name AS recipe_name, r.cuisine, r.prep_time_min
       FROM lifeos.meal_plans mp
       LEFT JOIN lifeos.recipes r ON mp.recipe_id = r.id
       WHERE mp.week_start = ${weekFilter}
       ORDER BY mp.day_of_week, mp.meal_type`,
    );
    res.json({ data: rows, week });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

mealsRouter.post('/plan/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status?: string };

  if (!status || !['cooked', 'skipped', 'ate_out'].includes(status)) {
    res
      .status(400)
      .json({ error: 'status must be one of: cooked, skipped, ate_out' });
    return;
  }

  try {
    await query(
      `UPDATE lifeos.meal_plans SET status = $1 WHERE id = $2`,
      status,
      id,
    );
    res.json({ success: true, id, status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

mealsRouter.get('/recipes', async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  const cuisine = req.query.cuisine as string | undefined;

  try {
    let sql = `SELECT * FROM lifeos.recipes WHERE 1=1`;
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND name ILIKE $${params.length}`;
    }
    if (cuisine) {
      params.push(cuisine);
      sql += ` AND cuisine = $${params.length}`;
    }

    sql += ` ORDER BY name ASC`;

    const rows = await query(sql, ...params);
    res.json({ data: rows });
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
    res.json({ success: true, id, rating });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
