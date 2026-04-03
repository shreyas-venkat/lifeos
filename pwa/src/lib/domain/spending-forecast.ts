/**
 * Spending forecast -- projects current month spending based on
 * daily average and compares to last month.
 *
 * Ported from src/api/routes/spending.ts (forecast endpoint only)
 */
import { query } from '$lib/db';

interface SpendingForecast {
  current_month_total: number;
  days_elapsed: number;
  daily_average: number;
  projected_total: number;
  last_month_total: number;
  change_pct: number;
  by_category: { category: string; total: number; projected: number }[];
}

export async function getSpendingForecast(): Promise<SpendingForecast> {
  const currentMonthRows = await query(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM lifeos.transactions
     WHERE transaction_date >= date_trunc('month', (NOW() AT TIME ZONE 'America/Edmonton')::DATE)`,
  );
  const currentMonthTotal = Number(
    (currentMonthRows[0] as Record<string, unknown>).total ?? 0,
  );

  const daysElapsedRows = await query(
    `SELECT GREATEST(EXTRACT(DAY FROM (NOW() AT TIME ZONE 'America/Edmonton')::DATE)::INTEGER, 1) as days_elapsed,
            EXTRACT(DAY FROM LAST_DAY((NOW() AT TIME ZONE 'America/Edmonton')::DATE))::INTEGER as days_in_month`,
  );
  const daysElapsed = Number(
    (daysElapsedRows[0] as Record<string, unknown>).days_elapsed,
  );
  const daysInMonth = Number(
    (daysElapsedRows[0] as Record<string, unknown>).days_in_month,
  );

  const dailyAverage = currentMonthTotal / daysElapsed;
  const projectedTotal = dailyAverage * daysInMonth;

  const lastMonthRows = await query(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM lifeos.transactions
     WHERE transaction_date >= date_trunc('month', (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '1' MONTH)
       AND transaction_date < date_trunc('month', (NOW() AT TIME ZONE 'America/Edmonton')::DATE)`,
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

  const categoryRows = await query(
    `SELECT category, SUM(amount) as total
     FROM lifeos.transactions
     WHERE transaction_date >= date_trunc('month', (NOW() AT TIME ZONE 'America/Edmonton')::DATE)
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

  return {
    current_month_total: currentMonthTotal,
    days_elapsed: daysElapsed,
    daily_average: Math.round(dailyAverage * 100) / 100,
    projected_total: Math.round(projectedTotal * 100) / 100,
    last_month_total: lastMonthTotal,
    change_pct: changePct,
    by_category: byCategory,
  };
}
