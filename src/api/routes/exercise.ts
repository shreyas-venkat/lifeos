import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const exerciseRouter = Router();

const VALID_CATEGORIES = new Set([
  'cardio',
  'strength',
  'flexibility',
  'sports',
]);

exerciseRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, log_date, exercise_type, duration_min, sets, reps,
              weight_kg, distance_km, calories_burned, notes, created_at
       FROM lifeos.exercise_log
       WHERE log_date = (NOW() AT TIME ZONE 'America/Edmonton')::DATE
       ORDER BY created_at`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

exerciseRouter.get('/history', async (req: Request, res: Response) => {
  const daysParam = req.query.days;
  const days = daysParam ? Number(daysParam) : 30;

  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: 'days must be a number between 1 and 365' });
    return;
  }

  try {
    const rows = await query(
      `SELECT log_date,
              COUNT(*) AS exercise_count,
              SUM(duration_min) AS total_duration,
              SUM(calories_burned) AS total_calories
       FROM lifeos.exercise_log
       WHERE log_date >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
       GROUP BY log_date
       ORDER BY log_date ASC`,
    );
    res.json({ data: rows, days });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

exerciseRouter.post('/log', async (req: Request, res: Response) => {
  const {
    exercise_type,
    duration_min,
    sets,
    reps,
    weight_kg,
    distance_km,
    calories_burned,
    notes,
  } = req.body as Record<string, unknown>;

  if (!exercise_type || typeof exercise_type !== 'string') {
    res
      .status(400)
      .json({ error: 'exercise_type is required and must be a string' });
    return;
  }

  try {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO lifeos.exercise_log (id, log_date, exercise_type, duration_min, sets, reps, weight_kg, distance_km, calories_burned, notes)
       VALUES ($1, (NOW() AT TIME ZONE 'America/Edmonton')::DATE, $2, $3, $4, $5, $6, $7, $8, $9)`,
      id,
      exercise_type,
      duration_min != null ? Number(duration_min) : null,
      sets != null ? Number(sets) : null,
      reps != null ? Number(reps) : null,
      weight_kg != null ? Number(weight_kg) : null,
      distance_km != null ? Number(distance_km) : null,
      calories_burned != null ? Number(calories_burned) : null,
      notes && typeof notes === 'string' ? notes : null,
    );
    res.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

exerciseRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await query(`DELETE FROM lifeos.exercise_log WHERE id = $1`, id);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

exerciseRouter.get('/templates', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, name, category, default_sets, default_reps, muscles_targeted, created_at
       FROM lifeos.exercise_templates
       ORDER BY category, name`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

exerciseRouter.post('/templates', async (req: Request, res: Response) => {
  const { name, category, default_sets, default_reps } = req.body as Record<
    string,
    unknown
  >;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required and must be a string' });
    return;
  }
  if (!category || typeof category !== 'string') {
    res
      .status(400)
      .json({ error: 'category is required and must be a string' });
    return;
  }
  if (!VALID_CATEGORIES.has(category)) {
    res.status(400).json({
      error: `category must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
    });
    return;
  }

  try {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO lifeos.exercise_templates (id, name, category, default_sets, default_reps)
       VALUES ($1, $2, $3, $4, $5)`,
      id,
      name,
      category,
      default_sets != null ? Number(default_sets) : null,
      default_reps != null ? Number(default_reps) : null,
    );
    res.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
