import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const moodRouter = Router();

const VALID_TIMES = ['morning', 'afternoon', 'evening'];

moodRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, mood, energy, notes, log_date, log_time, created_at
       FROM lifeos.mood_log
       WHERE log_date = CURRENT_DATE
       ORDER BY log_time`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

moodRouter.post('/log', async (req: Request, res: Response) => {
  const { mood, energy, notes, log_time } = req.body as {
    mood?: number;
    energy?: number;
    notes?: string;
    log_time?: string;
  };

  if (mood === undefined || typeof mood !== 'number') {
    res.status(400).json({ error: 'mood is required and must be a number' });
    return;
  }
  if (mood < 1 || mood > 5) {
    res.status(400).json({ error: 'mood must be between 1 and 5' });
    return;
  }
  if (energy === undefined || typeof energy !== 'number') {
    res.status(400).json({ error: 'energy is required and must be a number' });
    return;
  }
  if (energy < 1 || energy > 5) {
    res.status(400).json({ error: 'energy must be between 1 and 5' });
    return;
  }

  const time = log_time || 'morning';
  if (!VALID_TIMES.includes(time)) {
    res
      .status(400)
      .json({ error: 'log_time must be morning, afternoon, or evening' });
    return;
  }

  try {
    const existing = await query(
      `SELECT id FROM lifeos.mood_log
       WHERE log_date = CURRENT_DATE AND log_time = $1`,
      time,
    );

    if (existing.length > 0) {
      const row = existing[0] as { id: string };
      await query(
        `UPDATE lifeos.mood_log SET mood = $1, energy = $2, notes = $3 WHERE id = $4`,
        mood,
        energy,
        notes ?? null,
        row.id,
      );
      res.json({ success: true, id: row.id, updated: true });
    } else {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.mood_log (id, mood, energy, notes, log_date, log_time)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, $5)`,
        id,
        mood,
        energy,
        notes ?? null,
        time,
      );
      res.json({ success: true, id, updated: false });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

moodRouter.get('/history', async (req: Request, res: Response) => {
  const daysParam = req.query.days as string | undefined;
  const days = daysParam ? Number(daysParam) : 30;

  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: 'days must be a number between 1 and 365' });
    return;
  }

  try {
    const rows = await query(
      `SELECT id, mood, energy, notes, log_date, log_time, created_at
       FROM lifeos.mood_log
       WHERE log_date >= CURRENT_DATE - INTERVAL '${String(days)}' DAY
       ORDER BY log_date DESC, log_time`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
