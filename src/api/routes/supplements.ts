import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const supplementsRouter = Router();

supplementsRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT * FROM lifeos.supplement_log
       WHERE date = CURRENT_DATE
       ORDER BY time_of_day ASC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

supplementsRouter.post('/:id/taken', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { taken_at } = req.body as { taken_at?: string };

  const timestamp = taken_at || new Date().toISOString();

  try {
    await query(
      `UPDATE lifeos.supplement_log SET taken = true, taken_at = $1 WHERE id = $2`,
      timestamp,
      id,
    );
    res.json({ success: true, id, taken_at: timestamp });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
