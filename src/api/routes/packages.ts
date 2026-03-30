import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { randomUUID } from 'crypto';

export const packagesRouter = Router();

const VALID_STATUSES = [
  'ordered',
  'shipped',
  'in-transit',
  'out-for-delivery',
  'delivered',
] as const;

type PackageStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(val: unknown): val is PackageStatus {
  return (
    typeof val === 'string' && VALID_STATUSES.includes(val as PackageStatus)
  );
}

// GET / — list active packages (status != 'delivered'), ordered by expected_delivery
packagesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, merchant, tracking_number, carrier, status, expected_delivery, actual_delivery, created_at
       FROM lifeos.packages
       WHERE status != 'delivered'
       ORDER BY expected_delivery ASC NULLS LAST`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /all — list all packages including delivered
packagesRouter.get('/all', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, merchant, tracking_number, carrier, status, expected_delivery, actual_delivery, created_at
       FROM lifeos.packages
       ORDER BY created_at DESC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST / — add a package manually
packagesRouter.post('/', async (req: Request, res: Response) => {
  const { merchant, tracking_number, carrier, expected_delivery } =
    req.body as {
      merchant?: string;
      tracking_number?: string;
      carrier?: string;
      expected_delivery?: string;
    };

  if (!merchant || typeof merchant !== 'string') {
    res
      .status(400)
      .json({ error: 'merchant is required and must be a string' });
    return;
  }

  const id = randomUUID();

  try {
    await query(
      `INSERT INTO lifeos.packages (id, merchant, tracking_number, carrier, expected_delivery)
       VALUES ($1, $2, $3, $4, $5)`,
      id,
      merchant,
      tracking_number || null,
      carrier || null,
      expected_delivery || null,
    );
    res.json({
      success: true,
      id,
      merchant,
      tracking_number: tracking_number || null,
      carrier: carrier || null,
      expected_delivery: expected_delivery || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// PUT /:id — update status
packagesRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status?: string };

  if (!isValidStatus(status)) {
    res.status(400).json({
      error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
    });
    return;
  }

  try {
    const actualDelivery =
      status === 'delivered' ? 'CURRENT_TIMESTAMP' : 'actual_delivery';
    await query(
      `UPDATE lifeos.packages SET status = $1, actual_delivery = ${actualDelivery} WHERE id = $2`,
      status,
      id,
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// DELETE /:id — delete a package
packagesRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await query(`DELETE FROM lifeos.packages WHERE id = $1`, id);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
