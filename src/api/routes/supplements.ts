import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const supplementsRouter = Router();

function sanitize(val: unknown): string {
  return String(val).replace(/'/g, "''");
}

supplementsRouter.post('/add', async (req: Request, res: Response) => {
  const { name, default_dosage, unit, time_of_day, max_safe_dosage } =
    req.body as Record<string, unknown>;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required and must be a string' });
    return;
  }

  try {
    const id = crypto.randomUUID();
    const maxSafeClause =
      max_safe_dosage !== undefined ? Number(max_safe_dosage) : 'NULL';
    await query(
      `INSERT INTO lifeos.supplements (id, name, default_dosage, unit, time_of_day, max_safe_dosage, active)
       VALUES ('${sanitize(id)}', '${sanitize(name)}', ${Number(default_dosage) || 0}, '${sanitize(unit || '')}', '${sanitize(time_of_day || 'morning')}', ${maxSafeClause}, true)`,
    );
    res.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

supplementsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await query(`DELETE FROM lifeos.supplements WHERE id = '${sanitize(id)}'`);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

supplementsRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { default_dosage, unit, time_of_day, active } = req.body as Record<
    string,
    unknown
  >;

  const setClauses: string[] = [];
  if (default_dosage !== undefined)
    setClauses.push(`default_dosage = ${Number(default_dosage)}`);
  if (unit !== undefined) setClauses.push(`unit = '${sanitize(unit)}'`);
  if (time_of_day !== undefined)
    setClauses.push(`time_of_day = '${sanitize(time_of_day)}'`);
  if (active !== undefined)
    setClauses.push(`active = ${active ? 'true' : 'false'}`);

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  try {
    await query(
      `UPDATE lifeos.supplements SET ${setClauses.join(', ')} WHERE id = '${sanitize(id)}'`,
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

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
