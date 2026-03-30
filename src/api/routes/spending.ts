import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { randomUUID } from 'crypto';

export const spendingRouter = Router();

const VALID_CATEGORIES = [
  'groceries',
  'dining',
  'transport',
  'entertainment',
  'bills',
  'health',
  'shopping',
  'other',
] as const;

type Category = (typeof VALID_CATEGORIES)[number];

function isValidCategory(val: unknown): val is Category {
  return typeof val === 'string' && VALID_CATEGORIES.includes(val as Category);
}

// GET /summary?period=month — Spending by category for current month
spendingRouter.get('/summary', async (req: Request, res: Response) => {
  const period = (req.query.period as string) || 'month';

  if (period !== 'month') {
    res.status(400).json({ error: 'period must be "month"' });
    return;
  }

  try {
    const rows = await query(
      `SELECT category, SUM(amount) as total, COUNT(*) as count
       FROM lifeos.transactions
       WHERE transaction_date >= date_trunc('month', CURRENT_DATE)
       GROUP BY category
       ORDER BY total DESC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /history?months=6 — Monthly spending totals
spendingRouter.get('/history', async (req: Request, res: Response) => {
  const monthsParam = req.query.months;
  const months = monthsParam !== undefined ? Number(monthsParam) : 6;

  if (isNaN(months) || months < 1 || months > 24) {
    res.status(400).json({ error: 'months must be a number between 1 and 24' });
    return;
  }

  try {
    const rows = await query(
      `SELECT date_trunc('month', transaction_date) as month, SUM(amount) as total
       FROM lifeos.transactions
       WHERE transaction_date >= CURRENT_DATE - INTERVAL '${String(months)}' MONTH
       GROUP BY date_trunc('month', transaction_date)
       ORDER BY month ASC`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /recent — Last 20 transactions
spendingRouter.get('/recent', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT id, amount, merchant, category, description, transaction_date, source, created_at
       FROM lifeos.transactions
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 20`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /log — Manual transaction entry
spendingRouter.post('/log', async (req: Request, res: Response) => {
  const { amount, merchant, category, description, date } = req.body as {
    amount?: number;
    merchant?: string;
    category?: string;
    description?: string;
    date?: string;
  };

  if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
    res
      .status(400)
      .json({ error: 'amount is required and must be a positive number' });
    return;
  }

  if (!merchant || typeof merchant !== 'string') {
    res
      .status(400)
      .json({ error: 'merchant is required and must be a string' });
    return;
  }

  if (!isValidCategory(category)) {
    res.status(400).json({
      error: `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
    });
    return;
  }

  const id = randomUUID();
  const txDate = date || new Date().toISOString().split('T')[0];

  try {
    await query(
      `INSERT INTO lifeos.transactions (id, amount, merchant, category, description, transaction_date, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'manual')`,
      id,
      amount,
      merchant,
      category,
      description || null,
      txDate,
    );
    res.json({
      success: true,
      id,
      amount,
      merchant,
      category,
      description: description || null,
      transaction_date: txDate,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// DELETE /:id — Delete a transaction
spendingRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await query(`DELETE FROM lifeos.transactions WHERE id = $1`, id);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /forecast — Spending forecast for current month
spendingRouter.get('/forecast', async (_req: Request, res: Response) => {
  try {
    // Current month total spend
    const currentMonthRows = await query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM lifeos.transactions
       WHERE transaction_date >= date_trunc('month', CURRENT_DATE)`,
    );
    const currentMonthTotal = Number(
      (currentMonthRows[0] as Record<string, unknown>).total ?? 0,
    );

    // Days elapsed in current month (at least 1 to avoid division by zero)
    const daysElapsedRows = await query(
      `SELECT GREATEST(EXTRACT(DAY FROM CURRENT_DATE)::INTEGER, 1) as days_elapsed,
              EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE))::INTEGER as days_in_month`,
    );
    const daysElapsed = Number(
      (daysElapsedRows[0] as Record<string, unknown>).days_elapsed,
    );
    const daysInMonth = Number(
      (daysElapsedRows[0] as Record<string, unknown>).days_in_month,
    );

    const dailyAverage = currentMonthTotal / daysElapsed;
    const projectedTotal = dailyAverage * daysInMonth;

    // Last month total for comparison
    const lastMonthRows = await query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM lifeos.transactions
       WHERE transaction_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1' MONTH)
         AND transaction_date < date_trunc('month', CURRENT_DATE)`,
    );
    const lastMonthTotal = Number(
      (lastMonthRows[0] as Record<string, unknown>).total ?? 0,
    );

    const changePct =
      lastMonthTotal > 0
        ? Math.round(
            ((projectedTotal - lastMonthTotal) / lastMonthTotal) * 1000,
          ) / 10
        : 0;

    // By-category breakdown with projections
    const categoryRows = await query(
      `SELECT category, SUM(amount) as total
       FROM lifeos.transactions
       WHERE transaction_date >= date_trunc('month', CURRENT_DATE)
       GROUP BY category
       ORDER BY total DESC`,
    );
    const byCategory = categoryRows.map((row) => {
      const r = row as Record<string, unknown>;
      const catTotal = Number(r.total);
      return {
        category: r.category as string,
        total: catTotal,
        projected:
          Math.round((catTotal / daysElapsed) * daysInMonth * 100) / 100,
      };
    });

    res.json({
      data: {
        current_month_total: currentMonthTotal,
        days_elapsed: daysElapsed,
        daily_average: Math.round(dailyAverage * 100) / 100,
        projected_total: Math.round(projectedTotal * 100) / 100,
        last_month_total: lastMonthTotal,
        change_pct: changePct,
        by_category: byCategory,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /budget — Monthly budget from preferences
spendingRouter.get('/budget', async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT value FROM lifeos.preferences WHERE key = 'monthly_budget' AND skill = 'spending'`,
    );

    if (rows.length === 0) {
      res.json({ data: null });
      return;
    }

    const budget = Number((rows[0] as Record<string, unknown>).value);
    if (isNaN(budget)) {
      res.json({ data: null });
      return;
    }

    // Get current month total
    const totalRows = await query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM lifeos.transactions
       WHERE transaction_date >= date_trunc('month', CURRENT_DATE)`,
    );

    const spent = Number((totalRows[0] as Record<string, unknown>).total ?? 0);

    res.json({
      data: {
        budget,
        spent,
        remaining: budget - spent,
        percent_used: budget > 0 ? Math.round((spent / budget) * 100) : 0,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
