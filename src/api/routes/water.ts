import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const waterRouter = Router();

waterRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT glasses FROM lifeos.water_log WHERE log_date = CURRENT_DATE`,
    );

    const glasses =
      rows.length > 0 ? (rows[0] as { glasses: number }).glasses : 0;
    res.json({ data: { glasses } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

waterRouter.post('/log', async (_req: Request, res: Response) => {
  try {
    const existing = await query(
      `SELECT id, glasses FROM lifeos.water_log WHERE log_date = CURRENT_DATE`,
    );

    if (existing.length > 0) {
      const row = existing[0] as { id: string; glasses: number };
      await query(
        `UPDATE lifeos.water_log SET glasses = $1 WHERE id = $2`,
        row.glasses + 1,
        row.id,
      );
      res.json({ success: true, glasses: row.glasses + 1 });
    } else {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.water_log (id, glasses, log_date) VALUES ($1, 1, CURRENT_DATE)`,
        id,
      );
      res.json({ success: true, glasses: 1 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
