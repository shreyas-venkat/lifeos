import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const weeklyReportRouter = Router();

/** Returns ISO week string like "2026-W13" */
function isoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

interface HealthStats {
  avg_steps: number | null;
  avg_hr: number | null;
  avg_sleep: number | null;
  weight_change: number | null;
}

interface MealStats {
  cooked: number;
  skipped: number;
  ate_out: number;
  avg_calories: number | null;
}

interface SupplementStats {
  adherence_pct: number | null;
  missed_days: string[];
}

interface ExerciseStats {
  sessions: number;
  total_duration_min: number;
}

interface WeeklyReport {
  week: string;
  generated_at: string;
  health: HealthStats;
  meals: MealStats;
  supplements: SupplementStats;
  exercise: ExerciseStats;
  highlights: string[];
}

async function generateReport(weekStart: string, weekEnd: string): Promise<Omit<WeeklyReport, 'week' | 'generated_at'>> {
  // Run all queries in parallel
  const [healthRows, weightRows, mealStatusRows, calorieRows, suppRows, exerciseRows] =
    await Promise.all([
      // Health averages (steps, HR, sleep)
      query(
        `SELECT metric_type, AVG(value) AS avg_val
         FROM lifeos.health_metrics
         WHERE recorded_at >= '${weekStart}' AND recorded_at < '${weekEnd}'
           AND metric_type IN ('steps', 'heart_rate', 'sleep_duration')
         GROUP BY metric_type`,
      ).catch(() => [] as Record<string, unknown>[]),

      // Weight change: first and last reading of the week
      query(
        `SELECT value, recorded_at
         FROM lifeos.health_metrics
         WHERE recorded_at >= '${weekStart}' AND recorded_at < '${weekEnd}'
           AND metric_type = 'weight'
         ORDER BY recorded_at ASC`,
      ).catch(() => [] as Record<string, unknown>[]),

      // Meal plan statuses
      query(
        `SELECT status, COUNT(*) AS cnt
         FROM lifeos.meal_plans
         WHERE week_start >= '${weekStart}' AND week_start < '${weekEnd}'
         GROUP BY status`,
      ).catch(() => [] as Record<string, unknown>[]),

      // Average daily calories
      query(
        `SELECT AVG(daily_total) AS avg_cal FROM (
           SELECT log_date, SUM(calories) AS daily_total
           FROM lifeos.calorie_log
           WHERE log_date >= '${weekStart}' AND log_date < '${weekEnd}'
           GROUP BY log_date
         ) sub`,
      ).catch(() => [] as Record<string, unknown>[]),

      // Supplement adherence
      query(
        `SELECT
           CAST(log_date AS VARCHAR) AS log_date,
           COUNT(CASE WHEN sl.taken = true THEN 1 END) AS taken_count,
           COUNT(s.id) AS total_count
         FROM lifeos.supplements s
         CROSS JOIN (
           SELECT DISTINCT CAST(log_date AS DATE) AS log_date
           FROM lifeos.supplement_log
           WHERE log_date >= '${weekStart}' AND log_date < '${weekEnd}'
         ) dates
         LEFT JOIN lifeos.supplement_log sl
           ON sl.supplement_id = s.id AND sl.log_date = dates.log_date
         WHERE s.active = true
         GROUP BY dates.log_date
         ORDER BY dates.log_date`,
      ).catch(() => [] as Record<string, unknown>[]),

      // Exercise sessions (from health_metrics with exercise-related types)
      query(
        `SELECT COUNT(*) AS sessions,
                COALESCE(SUM(value), 0) AS total_min
         FROM lifeos.health_metrics
         WHERE recorded_at >= '${weekStart}' AND recorded_at < '${weekEnd}'
           AND metric_type = 'exercise_duration'`,
      ).catch(() => [] as Record<string, unknown>[]),
    ]);

  // Parse health
  const healthMap: Record<string, number> = {};
  for (const row of healthRows) {
    healthMap[row.metric_type as string] = Number(row.avg_val);
  }

  const avgSteps = healthMap.steps ?? null;
  const avgHr = healthMap.heart_rate ?? null;
  const avgSleep = healthMap.sleep_duration ?? null;

  let weightChange: number | null = null;
  if (weightRows.length >= 2) {
    const first = Number(weightRows[0].value);
    const last = Number(weightRows[weightRows.length - 1].value);
    weightChange = Math.round((last - first) * 10) / 10;
  }

  // Parse meals
  const mealMap: Record<string, number> = {};
  for (const row of mealStatusRows) {
    mealMap[row.status as string] = Number(row.cnt);
  }

  const avgCalories =
    calorieRows.length > 0 && calorieRows[0].avg_cal !== null
      ? Math.round(Number(calorieRows[0].avg_cal))
      : null;

  // Parse supplements
  let totalTaken = 0;
  let totalExpected = 0;
  const missedDays: string[] = [];

  for (const row of suppRows) {
    const taken = Number(row.taken_count);
    const total = Number(row.total_count);
    totalTaken += taken;
    totalExpected += total;
    if (taken < total) {
      const dateStr = String(row.log_date).split('T')[0];
      missedDays.push(dateStr);
    }
  }

  const adherencePct =
    totalExpected > 0
      ? Math.round((totalTaken / totalExpected) * 100)
      : null;

  // Parse exercise
  const sessions =
    exerciseRows.length > 0 ? Number(exerciseRows[0].sessions) : 0;
  const totalDuration =
    exerciseRows.length > 0 ? Number(exerciseRows[0].total_min) : 0;

  // Generate highlights
  const highlights: string[] = [];

  if (weightChange !== null && weightChange < 0) {
    highlights.push(`Weight down ${Math.abs(weightChange)}kg this week`);
  } else if (weightChange !== null && weightChange > 0) {
    highlights.push(`Weight up ${weightChange}kg this week`);
  }

  if (adherencePct !== null && adherencePct >= 80) {
    const streak = suppRows.length - missedDays.length;
    if (streak > 0) {
      highlights.push(`${streak}-day supplement streak`);
    }
  } else if (adherencePct !== null && adherencePct < 50) {
    highlights.push(
      `Supplement adherence at ${adherencePct}% -- try setting reminders`,
    );
  }

  if (avgSteps !== null) {
    if (avgSteps >= 8000) {
      highlights.push(
        `Averaging ${Math.round(avgSteps).toLocaleString()} steps -- great activity`,
      );
    } else if (avgSteps < 5000) {
      highlights.push(
        `Only ${Math.round(avgSteps).toLocaleString()} avg steps -- try to move more`,
      );
    }
  }

  if (avgSleep !== null) {
    if (avgSleep >= 7.5) {
      highlights.push(
        `${avgSleep.toFixed(1)}h average sleep -- well rested`,
      );
    } else if (avgSleep < 6) {
      highlights.push(
        `${avgSleep.toFixed(1)}h average sleep -- prioritize rest`,
      );
    }
  }

  const cooked = mealMap.cooked ?? 0;
  if (cooked >= 5) {
    highlights.push(`Cooked ${cooked} meals this week`);
  }

  if (sessions > 0) {
    highlights.push(
      `${sessions} exercise session${sessions !== 1 ? 's' : ''} (${totalDuration} min total)`,
    );
  }

  return {
    health: {
      avg_steps: avgSteps !== null ? Math.round(avgSteps) : null,
      avg_hr: avgHr !== null ? Math.round(avgHr) : null,
      avg_sleep: avgSleep !== null ? Math.round(avgSleep * 10) / 10 : null,
      weight_change: weightChange,
    },
    meals: {
      cooked,
      skipped: mealMap.skipped ?? 0,
      ate_out: mealMap.ate_out ?? 0,
      avg_calories: avgCalories,
    },
    supplements: {
      adherence_pct: adherencePct,
      missed_days: missedDays,
    },
    exercise: {
      sessions,
      total_duration_min: totalDuration,
    },
    highlights,
  };
}

weeklyReportRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const week = isoWeek(now);

    // Compute Monday of current ISO week
    const dayOfWeek = now.getUTCDay() || 7; // 1=Mon, 7=Sun
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - dayOfWeek + 1);
    monday.setUTCHours(0, 0, 0, 0);

    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(monday.getUTCDate() + 7);

    const weekStart = monday.toISOString().split('T')[0];
    const weekEnd = nextMonday.toISOString().split('T')[0];

    const report = await generateReport(weekStart, weekEnd);

    res.json({
      week,
      generated_at: new Date().toISOString(),
      ...report,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

weeklyReportRouter.get('/history', async (_req: Request, res: Response) => {
  try {
    const reports: WeeklyReport[] = [];
    const now = new Date();

    for (let i = 0; i < 4; i++) {
      const offset = i * 7;
      const refDate = new Date(now);
      refDate.setUTCDate(now.getUTCDate() - offset);

      const week = isoWeek(refDate);
      const dayOfWeek = refDate.getUTCDay() || 7;
      const monday = new Date(refDate);
      monday.setUTCDate(refDate.getUTCDate() - dayOfWeek + 1);
      monday.setUTCHours(0, 0, 0, 0);

      const nextMonday = new Date(monday);
      nextMonday.setUTCDate(monday.getUTCDate() + 7);

      const weekStart = monday.toISOString().split('T')[0];
      const weekEnd = nextMonday.toISOString().split('T')[0];

      const report = await generateReport(weekStart, weekEnd);
      reports.push({
        week,
        generated_at: new Date().toISOString(),
        ...report,
      });
    }

    res.json(reports);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
