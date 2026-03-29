import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const preferencesRouter = Router();

preferencesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT key, value, skill, updated_at
       FROM lifeos.preferences
       ORDER BY skill, key`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

preferencesRouter.put('/', async (req: Request, res: Response) => {
  const { preferences } = req.body as {
    preferences?: Array<{ key: string; value: string; skill?: string }>;
  };

  if (!preferences || !Array.isArray(preferences)) {
    res.status(400).json({
      error: 'preferences is required and must be an array of {key, value}',
    });
    return;
  }

  for (const pref of preferences) {
    if (!pref.key || typeof pref.key !== 'string') {
      res.status(400).json({ error: 'each preference must have a string key' });
      return;
    }
    if (pref.value === undefined) {
      res.status(400).json({ error: 'each preference must have a value' });
      return;
    }
  }

  try {
    for (const pref of preferences) {
      const skill = pref.skill ?? 'general';
      await query(
        `INSERT INTO lifeos.preferences (key, value, skill)
         VALUES ($1, $2, $3)
         ON CONFLICT (key, skill) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        pref.key,
        String(pref.value),
        skill,
      );
    }
    res.json({ success: true, updated: preferences.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
