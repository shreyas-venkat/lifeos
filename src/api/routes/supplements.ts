import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const supplementsRouter = Router();

supplementsRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT s.id AS supplement_id, s.name, s.default_dosage, s.unit, s.time_of_day,
              sl.id AS log_id, sl.recommended_dosage, sl.reason, sl.taken, sl.log_date
       FROM lifeos.supplements s
       LEFT JOIN lifeos.supplement_log sl ON s.id = sl.supplement_id AND sl.log_date = CURRENT_DATE
       WHERE s.active = true
       ORDER BY s.time_of_day ASC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

supplementsRouter.post('/:id/taken', async (req: Request, res: Response) => {
  const supplementId = req.params.id;
  const timeOfDay =
    (req.body as Record<string, unknown>).time_of_day ?? 'morning';
  const id = crypto.randomUUID();

  try {
    await query(
      `INSERT INTO lifeos.supplement_log (id, supplement_id, taken, log_date, time_of_day)
       VALUES ($1, $2, true, CURRENT_DATE, $3)
       ON CONFLICT (id) DO UPDATE SET taken = true`,
      id,
      supplementId,
      String(timeOfDay),
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
