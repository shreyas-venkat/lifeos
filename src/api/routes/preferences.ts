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

/**
 * POST /notifications/toggle — save notification toggle state to preferences.
 *
 * This persists the desired state in MotherDuck. The actual pause/unpause of
 * the scheduled task must still be done via Discord ("pause task <task-name>")
 * because the API server does not have direct access to the NanoClaw SQLite DB.
 */
preferencesRouter.post(
  '/notifications/toggle',
  async (req: Request, res: Response) => {
    const { task_id, enabled } = req.body as {
      task_id?: string;
      enabled?: boolean;
    };

    if (!task_id || typeof task_id !== 'string') {
      res
        .status(400)
        .json({ error: 'task_id is required and must be a string' });
      return;
    }
    if (typeof enabled !== 'boolean') {
      res
        .status(400)
        .json({ error: 'enabled is required and must be a boolean' });
      return;
    }

    try {
      await query(
        `INSERT INTO lifeos.preferences (key, value, skill)
         VALUES ($1, $2, 'notifications')
         ON CONFLICT (key, skill) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        task_id,
        String(enabled),
      );
      res.json({ success: true, task_id, enabled });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  },
);

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
