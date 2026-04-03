import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const usageRouter = Router();

const VALID_PERIODS = ['today', 'week', 'month'] as const;
type Period = (typeof VALID_PERIODS)[number];

function isValidPeriod(val: unknown): val is Period {
  return typeof val === 'string' && VALID_PERIODS.includes(val as Period);
}

function periodToInterval(period: Period): string {
  const today = "(NOW() AT TIME ZONE 'America/Edmonton')::DATE";
  switch (period) {
    case 'today':
      return today;
    case 'week':
      return `${today} - INTERVAL '7' DAY`;
    case 'month':
      return `${today} - INTERVAL '30' DAY`;
  }
}

// GET /summary?period=today|week|month
usageRouter.get('/summary', async (req: Request, res: Response) => {
  const periodParam = (req.query.period as string) || 'today';

  if (!isValidPeriod(periodParam)) {
    res
      .status(400)
      .json({ error: 'period must be one of: today, week, month' });
    return;
  }

  const since = periodToInterval(periodParam);

  try {
    // Total cost and token counts
    const totalsRows = await query(
      `SELECT
         COALESCE(SUM(cost_usd), 0) as total_cost,
         COALESCE(SUM(input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(output_tokens), 0) as total_output_tokens,
         COUNT(*) as total_requests
       FROM lifeos.api_usage
       WHERE created_at >= ${since}`,
    );

    // Breakdown by task_id
    const byTaskRows = await query(
      `SELECT
         task_id,
         COALESCE(SUM(cost_usd), 0) as cost,
         COALESCE(SUM(input_tokens), 0) as input_tokens,
         COALESCE(SUM(output_tokens), 0) as output_tokens,
         COUNT(*) as requests
       FROM lifeos.api_usage
       WHERE created_at >= ${since}
       GROUP BY task_id
       ORDER BY cost DESC`,
    );

    // Breakdown by model
    const byModelRows = await query(
      `SELECT
         model,
         COALESCE(SUM(cost_usd), 0) as cost,
         COALESCE(SUM(input_tokens), 0) as input_tokens,
         COALESCE(SUM(output_tokens), 0) as output_tokens,
         COUNT(*) as requests
       FROM lifeos.api_usage
       WHERE created_at >= ${since}
       GROUP BY model
       ORDER BY cost DESC`,
    );

    // Daily trend
    const dailyRows = await query(
      `SELECT
         CAST(created_at AS DATE) as date,
         COALESCE(SUM(cost_usd), 0) as cost,
         COALESCE(SUM(input_tokens), 0) as input_tokens,
         COALESCE(SUM(output_tokens), 0) as output_tokens,
         COUNT(*) as requests
       FROM lifeos.api_usage
       WHERE created_at >= ${since}
       GROUP BY CAST(created_at AS DATE)
       ORDER BY date ASC`,
    );

    const totals = (totalsRows[0] as Record<string, unknown>) || {
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_requests: 0,
    };

    res.json({
      data: {
        period: periodParam,
        totals,
        byTask: byTaskRows,
        byModel: byModelRows,
        daily: dailyRows,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
