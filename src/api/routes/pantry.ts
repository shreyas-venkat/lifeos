import { Router, Request, Response } from 'express';
import { query } from '../db.js';

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
