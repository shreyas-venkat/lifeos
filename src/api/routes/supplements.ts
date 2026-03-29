import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const supplementsRouter = Router();

supplementsRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT * FROM lifeos.supplement_log
       WHERE log_date = CURRENT_DATE
       ORDER BY time_of_day ASC`,
    );
    res.json({ data: rows });
  } catch (_err: unknown) {
    res.json({ data: [] });
  }
});

supplementsRouter.post('/:id/taken', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await query(
      `UPDATE lifeos.supplement_log SET taken = true WHERE id = '${id}'`,
    );
    res.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
