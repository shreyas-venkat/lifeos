import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { randomUUID } from 'crypto';

export const habitsRouter = Router();

const VALID_FREQUENCIES = ['daily', 'weekly'] as const;

type Frequency = (typeof VALID_FREQUENCIES)[number];

function isValidFrequency(val: unknown): val is Frequency {
  return (
    typeof val === 'string' && VALID_FREQUENCIES.includes(val as Frequency)
  );
}

// GET / — All active habits with today's completion status
habitsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT h.id, h.name, h.description, h.frequency, h.target_per_day, h.color, h.icon,
              COALESCE(hl.completed, 0) as completed, hl.notes
       FROM lifeos.habits h
       LEFT JOIN lifeos.habit_log hl ON h.id = hl.habit_id AND hl.log_date = (NOW() AT TIME ZONE 'America/Edmonton')::DATE
       WHERE h.active = true
       ORDER BY h.name`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST / — Create new habit
habitsRouter.post('/', async (req: Request, res: Response) => {
  const { name, description, frequency, target_per_day, color, icon } =
    req.body as {
      name?: string;
      description?: string;
      frequency?: string;
      target_per_day?: number;
      color?: string;
      icon?: string;
    };

  if (!name || typeof name !== 'string' || !name.trim()) {
    res
      .status(400)
      .json({ error: 'name is required and must be a non-empty string' });
    return;
  }

  if (frequency !== undefined && !isValidFrequency(frequency)) {
    res.status(400).json({
      error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`,
    });
    return;
  }

  if (
    target_per_day !== undefined &&
    (typeof target_per_day !== 'number' || target_per_day < 1)
  ) {
    res
      .status(400)
      .json({ error: 'target_per_day must be a positive integer' });
    return;
  }

  const id = randomUUID();

  try {
    await query(
      `INSERT INTO lifeos.habits (id, name, description, frequency, target_per_day, color, icon)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      id,
      name.trim(),
      description || null,
      frequency || 'daily',
      target_per_day ?? 1,
      color || '#6366f1',
      icon || '\u2713',
    );
    res.json({
      success: true,
      id,
      name: name.trim(),
      description: description || null,
      frequency: frequency || 'daily',
      target_per_day: target_per_day ?? 1,
      color: color || '#6366f1',
      icon: icon || '\u2713',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /:id/complete — Mark habit completed for today (increment)
habitsRouter.post('/:id/complete', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Check habit exists and is active
    const habits = await query(
      `SELECT id, target_per_day FROM lifeos.habits WHERE id = $1 AND active = true`,
      id,
    );

    if (habits.length === 0) {
      res.status(404).json({ error: 'Habit not found or inactive' });
      return;
    }

    // Check for existing log entry today
    const existing = await query(
      `SELECT id, completed FROM lifeos.habit_log WHERE habit_id = $1 AND log_date = (NOW() AT TIME ZONE 'America/Edmonton')::DATE`,
      id,
    );

    let completed: number;

    if (existing.length > 0) {
      const row = existing[0] as Record<string, unknown>;
      completed = (Number(row.completed) || 0) + 1;
      await query(
        `UPDATE lifeos.habit_log SET completed = $1 WHERE id = $2`,
        completed,
        row.id as string,
      );
    } else {
      completed = 1;
      const logId = randomUUID();
      await query(
        `INSERT INTO lifeos.habit_log (id, habit_id, log_date, completed)
         VALUES ($1, $2, (NOW() AT TIME ZONE 'America/Edmonton')::DATE, 1)`,
        logId,
        id,
      );
    }

    res.json({ success: true, completed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// DELETE /:id — Deactivate habit (soft delete)
habitsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await query(`UPDATE lifeos.habits SET active = false WHERE id = $1`, id);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /history?days=30 — Daily completion grid data for all habits
habitsRouter.get('/history', async (req: Request, res: Response) => {
  const daysParam = req.query.days;
  const days = daysParam !== undefined ? Number(daysParam) : 30;

  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: 'days must be a number between 1 and 365' });
    return;
  }

  try {
    const rows = await query(
      `SELECT h.id, h.name, h.color, h.icon, h.target_per_day,
              hl.log_date, COALESCE(hl.completed, 0) as completed
       FROM lifeos.habits h
       LEFT JOIN lifeos.habit_log hl ON h.id = hl.habit_id
          AND hl.log_date >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
       WHERE h.active = true
       ORDER BY h.name, hl.log_date`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
