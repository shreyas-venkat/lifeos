import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const preferencesRouter = Router();

preferencesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT * FROM lifeos.preferences ORDER BY key ASC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

preferencesRouter.put('/', async (req: Request, res: Response) => {
  const { preferences } = req.body as {
    preferences?: Array<{ key: string; value: string }>;
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
      await query(
        `INSERT INTO lifeos.preferences (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        pref.key,
        String(pref.value),
      );
    }
    res.json({ success: true, updated: preferences.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
