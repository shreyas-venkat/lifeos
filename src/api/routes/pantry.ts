import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const pantryRouter = Router();

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
    await query(
      `INSERT INTO lifeos.pantry (id, item, quantity, unit, category, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      id,
      String(item),
      Number(quantity) || 0,
      String(unit || ''),
      String(category || ''),
      expiry_date ? String(expiry_date) : null,
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
    await query(`DELETE FROM lifeos.pantry WHERE id = $1`, id);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

pantryRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { item, quantity, unit, category, expiry_date } = req.body as Record<
    string,
    unknown
  >;

  // Build SET clause with positional params
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (item !== undefined) {
    sets.push(`item = $${idx++}`);
    params.push(String(item));
  }
  if (quantity !== undefined) {
    sets.push(`quantity = $${idx++}`);
    params.push(Number(quantity));
  }
  if (unit !== undefined) {
    sets.push(`unit = $${idx++}`);
    params.push(String(unit));
  }
  if (category !== undefined) {
    sets.push(`category = $${idx++}`);
    params.push(String(category));
  }
  if (expiry_date !== undefined) {
    sets.push(`expiry_date = $${idx++}`);
    params.push(expiry_date === null ? null : String(expiry_date));
  }

  if (sets.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  params.push(id);

  try {
    await query(
      `UPDATE lifeos.pantry SET ${sets.join(', ')} WHERE id = $${idx}`,
      ...params,
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
