import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const notificationsRouter = Router();

notificationsRouter.get('/pending', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, title, body, type, url, created_at
       FROM lifeos.notifications
       WHERE seen = FALSE
       ORDER BY created_at DESC
       LIMIT 50`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

notificationsRouter.post('/mark-seen', async (req: Request, res: Response) => {
  const { ids } = req.body as { ids?: string[] };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids must be a non-empty array of strings' });
    return;
  }

  if (ids.some((id) => typeof id !== 'string')) {
    res.status(400).json({ error: 'each id must be a string' });
    return;
  }

  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await query(
      `UPDATE lifeos.notifications SET seen = TRUE WHERE id IN (${placeholders})`,
      ...ids,
    );
    res.json({ success: true, count: ids.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

notificationsRouter.post('/send', async (req: Request, res: Response) => {
  const { title, body, type, url } = req.body as {
    title?: string;
    body?: string;
    type?: string;
    url?: string;
  };

  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'title is required and must be a string' });
    return;
  }

  if (!body || typeof body !== 'string') {
    res.status(400).json({ error: 'body is required and must be a string' });
    return;
  }

  const validTypes = ['info', 'warning', 'error', 'success'];
  const notifType = type || 'info';
  if (!validTypes.includes(notifType)) {
    res.status(400).json({
      error: `type must be one of: ${validTypes.join(', ')}`,
    });
    return;
  }

  try {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO lifeos.notifications (id, title, body, type, url)
       VALUES ($1, $2, $3, $4, $5)`,
      id,
      title,
      body,
      notifType,
      url ?? null,
    );
    res.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
