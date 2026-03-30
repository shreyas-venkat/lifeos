import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { randomUUID } from 'crypto';

export const subscriptionsRouter = Router();

const VALID_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'annual'] as const;

type Frequency = (typeof VALID_FREQUENCIES)[number];

function isValidFrequency(val: unknown): val is Frequency {
  return (
    typeof val === 'string' && VALID_FREQUENCIES.includes(val as Frequency)
  );
}

// GET / — list active subscriptions
subscriptionsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, name, merchant_pattern, amount, frequency, category, active, last_charged, created_at
       FROM lifeos.subscriptions
       WHERE active = true
       ORDER BY name ASC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /summary — total monthly subscription cost
subscriptionsRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT
         SUM(CASE
           WHEN frequency = 'weekly' THEN amount * 4.33
           WHEN frequency = 'monthly' THEN amount
           WHEN frequency = 'quarterly' THEN amount / 3.0
           WHEN frequency = 'annual' THEN amount / 12.0
           ELSE amount
         END) AS monthly_total,
         COUNT(*) AS count
       FROM lifeos.subscriptions
       WHERE active = true`,
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    res.json({
      data: {
        monthly_total: row?.monthly_total ?? 0,
        count: row?.count ?? 0,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST / — add a subscription
subscriptionsRouter.post('/', async (req: Request, res: Response) => {
  const { name, merchant_pattern, amount, frequency, category } = req.body as {
    name?: string;
    merchant_pattern?: string;
    amount?: number;
    frequency?: string;
    category?: string;
  };

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required and must be a string' });
    return;
  }

  if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
    res
      .status(400)
      .json({ error: 'amount is required and must be a positive number' });
    return;
  }

  const freq = frequency || 'monthly';
  if (!isValidFrequency(freq)) {
    res.status(400).json({
      error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`,
    });
    return;
  }

  const id = randomUUID();

  try {
    await query(
      `INSERT INTO lifeos.subscriptions (id, name, merchant_pattern, amount, frequency, category)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      id,
      name,
      merchant_pattern || null,
      amount,
      freq,
      category || null,
    );
    res.json({
      success: true,
      id,
      name,
      amount,
      frequency: freq,
      category: category || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// PUT /:id — update subscription
subscriptionsRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, amount, frequency, category, active } = req.body as {
    name?: string;
    amount?: number;
    frequency?: string;
    category?: string;
    active?: boolean;
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (name !== undefined) {
    sets.push(`name = $${paramIdx++}`);
    values.push(name);
  }
  if (amount !== undefined) {
    sets.push(`amount = $${paramIdx++}`);
    values.push(amount);
  }
  if (frequency !== undefined) {
    if (!isValidFrequency(frequency)) {
      res.status(400).json({
        error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`,
      });
      return;
    }
    sets.push(`frequency = $${paramIdx++}`);
    values.push(frequency);
  }
  if (category !== undefined) {
    sets.push(`category = $${paramIdx++}`);
    values.push(category);
  }
  if (active !== undefined) {
    sets.push(`active = $${paramIdx++}`);
    values.push(active);
  }

  if (sets.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  values.push(id);

  try {
    await query(
      `UPDATE lifeos.subscriptions SET ${sets.join(', ')} WHERE id = $${paramIdx}`,
      ...values,
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// DELETE /:id — delete a subscription
subscriptionsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await query(`DELETE FROM lifeos.subscriptions WHERE id = $1`, id);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
