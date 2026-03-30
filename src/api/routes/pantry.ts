import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const pantryRouter = Router();

function sanitize(val: unknown): string {
  return String(val).replace(/'/g, "''");
}

pantryRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, item, quantity, unit, category, expiry_date, updated_at
       FROM lifeos.pantry
       ORDER BY category, item ASC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

pantryRouter.post('/', async (req: Request, res: Response) => {
  const { item, quantity, unit, category, expiry_date } = req.body as Record<
    string,
    unknown
  >;

  if (!item || typeof item !== 'string') {
    res.status(400).json({ error: 'item is required and must be a string' });
    return;
  }

  try {
    const id = crypto.randomUUID();
    const expiryClause = expiry_date ? `'${sanitize(expiry_date)}'` : 'NULL';
    await query(
      `INSERT INTO lifeos.pantry (id, item, quantity, unit, category, expiry_date)
       VALUES ('${sanitize(id)}', '${sanitize(item)}', ${Number(quantity) || 0}, '${sanitize(unit || '')}', '${sanitize(category || '')}', ${expiryClause})`,
    );
    res.json({ success: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

pantryRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await query(`DELETE FROM lifeos.pantry WHERE id = '${sanitize(id)}'`);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

pantryRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { quantity, unit, category, expiry_date } = req.body as Record<
    string,
    unknown
  >;

  const setClauses: string[] = [];
  if (quantity !== undefined) setClauses.push(`quantity = ${Number(quantity)}`);
  if (unit !== undefined) setClauses.push(`unit = '${sanitize(unit)}'`);
  if (category !== undefined)
    setClauses.push(`category = '${sanitize(category)}'`);
  if (expiry_date !== undefined)
    setClauses.push(
      expiry_date === null
        ? 'expiry_date = NULL'
        : `expiry_date = '${sanitize(expiry_date)}'`,
    );

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  try {
    await query(
      `UPDATE lifeos.pantry SET ${setClauses.join(', ')} WHERE id = '${sanitize(id)}'`,
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

pantryRouter.post('/photo', async (req: Request, res: Response) => {
  const { image } = req.body as { image?: string };

  if (!image || typeof image !== 'string') {
    res
      .status(400)
      .json({ error: 'image is required and must be a base64 string' });
    return;
  }

  if (image.length > 10_000_000) {
    res.status(400).json({ error: 'image exceeds maximum size of 10MB' });
    return;
  }

  res.status(202).json({
    status: 'accepted',
    image_size: image.length,
  });
});
