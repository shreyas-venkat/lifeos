import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const remindersRouter = Router();

remindersRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, message, due_at, recurring_cron, status, created_at
       FROM lifeos.reminders
       WHERE status = 'active'
       ORDER BY due_at ASC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

remindersRouter.post('/', async (req: Request, res: Response) => {
  const { message, due_at, recurring_cron } = req.body as {
    message?: string;
    due_at?: string;
    recurring_cron?: string;
  };

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required and must be a string' });
    return;
  }

  if (!due_at || typeof due_at !== 'string') {
    res
      .status(400)
      .json({ error: 'due_at is required and must be a timestamp string' });
    return;
  }

  try {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO lifeos.reminders (id, message, due_at, recurring_cron, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      id,
      message,
      due_at,
      recurring_cron ?? null,
    );
    res.json({ success: true, id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

remindersRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { message, due_at } = req.body as {
    message?: string;
    due_at?: string;
  };

  if (!message && !due_at) {
    res.status(400).json({ error: 'message or due_at is required' });
    return;
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (message) {
    setClauses.push(`message = $${paramIdx}`);
    params.push(message);
    paramIdx++;
  }
  if (due_at) {
    setClauses.push(`due_at = $${paramIdx}`);
    params.push(due_at);
    paramIdx++;
  }

  params.push(id);

  try {
    await query(
      `UPDATE lifeos.reminders SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      ...params,
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

remindersRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await query(`DELETE FROM lifeos.reminders WHERE id = $1`, id);
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});
