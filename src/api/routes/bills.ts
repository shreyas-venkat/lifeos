import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const billsRouter = Router();

billsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, name, amount, merchant, due_date, recurring, status, created_at
       FROM lifeos.bills
       ORDER BY due_date ASC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

billsRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT recurring, SUM(amount) AS total, COUNT(*) AS count
       FROM lifeos.bills
       GROUP BY recurring`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
