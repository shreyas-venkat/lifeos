import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const healthContextRouter = Router();

const VALID_METRICS = new Set([
  'weight',
  'heart_rate',
  'hrv',
  'spo2',
  'sleep_duration',
  'sleep_quality',
  'steps',
]);

interface Insight {
  text: string;
  type: 'positive' | 'negative' | 'neutral';
  source: string;
}

interface CalorieRow {
  log_date: string;
  description: string;
  calories: number | null;
}

interface HealthRow {
  date: string;
  metric_type: string;
  avg_value: number;
}

interface SupplementRow {
  name: string;
  taken: boolean;
}

interface ExerciseRow {
  exercise_type: string;
  duration_min: number | null;
  sets: number | null;
  reps: number | null;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

async function getWeightInsights(date: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Calorie log for that date and day before
  const calorieRows = await query<CalorieRow>(
    `SELECT log_date, description, calories
     FROM lifeos.calorie_log
     WHERE log_date BETWEEN CAST('${date}' AS DATE) - INTERVAL '1' DAY AND CAST('${date}' AS DATE)
     ORDER BY log_date ASC`,
  );

  if (calorieRows.length > 0) {
    const totalCal = calorieRows.reduce(
      (sum, r) => sum + (r.calories ?? 0),
      0,
    );
    const descriptions = calorieRows
      .map((r) => r.description)
      .filter(Boolean)
      .join(' + ');
    insights.push({
      text: `You ate ${formatNumber(totalCal)} kcal yesterday (${descriptions})`,
      type: 'neutral',
      source: 'calorie_log',
    });
  }

  // Steps on that date
  const stepsRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'steps'
       AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
  );

  if (stepsRows.length > 0 && stepsRows[0].avg_value != null) {
    const steps = Math.round(stepsRows[0].avg_value);
    const type = steps < 5000 ? 'negative' : steps > 10000 ? 'positive' : 'neutral';
    insights.push({
      text:
        steps < 5000
          ? `Low activity (${formatNumber(steps)} steps) on days weight increased`
          : `${formatNumber(steps)} steps recorded`,
      type,
      source: 'health_metrics',
    });
  }

  // Weight trend over last 7 days
  const trendRows = await query<HealthRow>(
    `SELECT CAST(recorded_at AS DATE) AS date, AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'weight'
       AND CAST(recorded_at AS DATE) BETWEEN CAST('${date}' AS DATE) - INTERVAL '7' DAY AND CAST('${date}' AS DATE)
     GROUP BY CAST(recorded_at AS DATE)
     ORDER BY date ASC`,
  );

  if (trendRows.length >= 2) {
    const first = trendRows[0].avg_value;
    const last = trendRows[trendRows.length - 1].avg_value;
    const diff = last - first;
    const absDiff = Math.abs(diff).toFixed(1);
    if (diff < 0) {
      insights.push({
        text: `Weight down ${absDiff}kg over last 7 days`,
        type: 'positive',
        source: 'health_metrics',
      });
    } else if (diff > 0) {
      insights.push({
        text: `Weight up ${absDiff}kg over last 7 days`,
        type: 'negative',
        source: 'health_metrics',
      });
    } else {
      insights.push({
        text: `Weight stable over last 7 days`,
        type: 'neutral',
        source: 'health_metrics',
      });
    }
  }

  return insights;
}

async function getHeartRateInsights(date: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Supplements: ashwagandha/rhodiola
  const suppRows = await query<SupplementRow>(
    `SELECT s.name, sl.taken
     FROM lifeos.supplement_log sl
     JOIN lifeos.supplements s ON s.id = sl.supplement_id
     WHERE sl.log_date = CAST('${date}' AS DATE)
       AND LOWER(s.name) IN ('ashwagandha', 'rhodiola')`,
  );

  for (const row of suppRows) {
    if (row.taken) {
      insights.push({
        text: `${row.name} taken (may lower resting heart rate)`,
        type: 'positive',
        source: 'supplement_log',
      });
    }
  }

  // Sleep duration that night
  const sleepRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'sleep_duration'
       AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
  );

  if (sleepRows.length > 0 && sleepRows[0].avg_value != null) {
    const hours = sleepRows[0].avg_value;
    const type = hours < 6 ? 'negative' : hours >= 7 ? 'positive' : 'neutral';
    insights.push({
      text: `${hours.toFixed(1)}h sleep (${type === 'negative' ? 'low' : type === 'positive' ? 'good' : 'moderate'})`,
      type,
      source: 'health_metrics',
    });
  }

  // Steps (resting vs active context)
  const stepsRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'steps'
       AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
  );

  if (stepsRows.length > 0 && stepsRows[0].avg_value != null) {
    const steps = Math.round(stepsRows[0].avg_value);
    insights.push({
      text:
        steps > 10000
          ? `High activity (${formatNumber(steps)} steps) — elevated HR expected`
          : `${formatNumber(steps)} steps recorded`,
      type: 'neutral',
      source: 'health_metrics',
    });
  }

  // Exercise log for that day
  const exerciseRows = await query<ExerciseRow>(
    `SELECT exercise_type, duration_min, sets, reps
     FROM lifeos.exercise_log
     WHERE log_date = CAST('${date}' AS DATE)`,
  );

  for (const row of exerciseRows) {
    const desc = row.duration_min
      ? `${row.duration_min} min ${row.exercise_type}`
      : row.sets && row.reps
        ? `${row.sets}x${row.reps} ${row.exercise_type}`
        : row.exercise_type;
    insights.push({
      text: `You did ${desc} today — elevated HR is expected`,
      type: 'neutral',
      source: 'exercise_log',
    });
  }

  return insights;
}

async function getSleepInsights(date: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Supplements: melatonin/magnesium/l-theanine
  const suppRows = await query<SupplementRow>(
    `SELECT s.name, sl.taken
     FROM lifeos.supplement_log sl
     JOIN lifeos.supplements s ON s.id = sl.supplement_id
     WHERE sl.log_date = CAST('${date}' AS DATE)
       AND LOWER(s.name) IN ('melatonin', 'magnesium', 'l-theanine')`,
  );

  for (const row of suppRows) {
    if (row.taken) {
      insights.push({
        text: `${row.name} taken before bed`,
        type: 'positive',
        source: 'supplement_log',
      });
    }
  }

  // Late meals (check for entries — calorie_log has log_date but we check for evening meals)
  const lateRows = await query<CalorieRow>(
    `SELECT description, calories
     FROM lifeos.calorie_log
     WHERE log_date = CAST('${date}' AS DATE)
       AND LOWER(meal_type) IN ('dinner', 'snack', 'late_night')`,
  );

  if (lateRows.length > 0) {
    const descriptions = lateRows
      .map((r) => r.description)
      .filter(Boolean)
      .join(', ');
    insights.push({
      text: `Late meal: ${descriptions}`,
      type: 'negative',
      source: 'calorie_log',
    });
  }

  // Steps that day
  const stepsRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'steps'
       AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
  );

  if (stepsRows.length > 0 && stepsRows[0].avg_value != null) {
    const steps = Math.round(stepsRows[0].avg_value);
    const type = steps > 8000 ? 'positive' : 'neutral';
    insights.push({
      text: `${formatNumber(steps)} steps — ${steps > 8000 ? 'physical activity aids sleep' : 'moderate activity'}`,
      type,
      source: 'health_metrics',
    });
  }

  return insights;
}

async function getHrvInsights(date: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Supplements: ashwagandha/rhodiola
  const suppRows = await query<SupplementRow>(
    `SELECT s.name, sl.taken
     FROM lifeos.supplement_log sl
     JOIN lifeos.supplements s ON s.id = sl.supplement_id
     WHERE sl.log_date = CAST('${date}' AS DATE)
       AND LOWER(s.name) IN ('ashwagandha', 'rhodiola')`,
  );

  for (const row of suppRows) {
    if (row.taken) {
      insights.push({
        text: `${row.name} taken (may improve HRV)`,
        type: 'positive',
        source: 'supplement_log',
      });
    }
  }

  // Sleep quality
  const sleepRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'sleep_quality'
       AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
  );

  if (sleepRows.length > 0 && sleepRows[0].avg_value != null) {
    const quality = sleepRows[0].avg_value;
    const type = quality >= 80 ? 'positive' : quality < 60 ? 'negative' : 'neutral';
    insights.push({
      text: `Sleep quality: ${quality.toFixed(0)}%`,
      type,
      source: 'health_metrics',
    });
  }

  // Compare to 7-day average
  const avgRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'hrv'
       AND CAST(recorded_at AS DATE) BETWEEN CAST('${date}' AS DATE) - INTERVAL '7' DAY AND CAST('${date}' AS DATE) - INTERVAL '1' DAY`,
  );

  const todayRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'hrv'
       AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
  );

  if (
    avgRows.length > 0 &&
    avgRows[0].avg_value != null &&
    todayRows.length > 0 &&
    todayRows[0].avg_value != null
  ) {
    const avg = avgRows[0].avg_value;
    const today = todayRows[0].avg_value;
    const diff = today - avg;
    const absDiff = Math.abs(diff).toFixed(0);
    if (diff > 0) {
      insights.push({
        text: `HRV ${absDiff}ms above 7-day average`,
        type: 'positive',
        source: 'health_metrics',
      });
    } else if (diff < 0) {
      insights.push({
        text: `HRV ${absDiff}ms below 7-day average`,
        type: 'negative',
        source: 'health_metrics',
      });
    }
  }

  return insights;
}

async function getSpo2Insights(date: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Current value check
  const spo2Rows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'spo2'
       AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
  );

  if (spo2Rows.length > 0 && spo2Rows[0].avg_value != null) {
    const spo2 = spo2Rows[0].avg_value;
    if (spo2 < 95) {
      insights.push({
        text: `SpO2 at ${spo2.toFixed(1)}% — below normal threshold of 95%`,
        type: 'negative',
        source: 'health_metrics',
      });
    }
  }

  // Sleep correlation
  const sleepRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'sleep_quality'
       AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
  );

  if (sleepRows.length > 0 && sleepRows[0].avg_value != null) {
    const quality = sleepRows[0].avg_value;
    insights.push({
      text: `Sleep quality was ${quality.toFixed(0)}% — ${quality < 60 ? 'poor sleep may affect oxygenation' : 'sleep quality adequate'}`,
      type: quality < 60 ? 'negative' : 'neutral',
      source: 'health_metrics',
    });
  }

  return insights;
}

async function getStepsInsights(date: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Calorie intake
  const calRows = await query<CalorieRow>(
    `SELECT SUM(calories) AS calories
     FROM lifeos.calorie_log
     WHERE log_date = CAST('${date}' AS DATE)`,
  );

  if (calRows.length > 0 && calRows[0].calories != null) {
    insights.push({
      text: `${formatNumber(calRows[0].calories)} kcal consumed`,
      type: 'neutral',
      source: 'calorie_log',
    });
  }

  // Compare to 7-day average
  const avgRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'steps'
       AND CAST(recorded_at AS DATE) BETWEEN CAST('${date}' AS DATE) - INTERVAL '7' DAY AND CAST('${date}' AS DATE) - INTERVAL '1' DAY`,
  );

  const todayRows = await query<HealthRow>(
    `SELECT AVG(value) AS avg_value
     FROM lifeos.health_metrics
     WHERE metric_type = 'steps'
       AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
  );

  if (
    avgRows.length > 0 &&
    avgRows[0].avg_value != null &&
    todayRows.length > 0 &&
    todayRows[0].avg_value != null
  ) {
    const avg = Math.round(avgRows[0].avg_value);
    const today = Math.round(todayRows[0].avg_value);
    const diff = today - avg;
    if (diff > 0) {
      insights.push({
        text: `${formatNumber(diff)} steps above 7-day average (${formatNumber(avg)})`,
        type: 'positive',
        source: 'health_metrics',
      });
    } else if (diff < 0) {
      insights.push({
        text: `${formatNumber(Math.abs(diff))} steps below 7-day average (${formatNumber(avg)})`,
        type: 'negative',
        source: 'health_metrics',
      });
    }
  }

  // Exercise log for that day
  const exerciseRows = await query<ExerciseRow>(
    `SELECT exercise_type, duration_min, sets, reps
     FROM lifeos.exercise_log
     WHERE log_date = CAST('${date}' AS DATE)`,
  );

  for (const row of exerciseRows) {
    const desc = row.duration_min
      ? `${row.duration_min} min ${row.exercise_type}`
      : row.sets && row.reps
        ? `${row.sets}x${row.reps} ${row.exercise_type}`
        : row.exercise_type;
    insights.push({
      text: `You did ${desc} today — step count reflects workout activity`,
      type: 'positive',
      source: 'exercise_log',
    });
  }

  return insights;
}

healthContextRouter.get('/', async (req: Request, res: Response) => {
  const metric = req.query.metric as string | undefined;
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

  if (!metric || !VALID_METRICS.has(metric)) {
    res.status(400).json({
      error: `metric is required and must be one of: ${[...VALID_METRICS].join(', ')}`,
    });
    return;
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    return;
  }

  try {
    // Get the metric value for the given date
    const valueRows = await query<HealthRow>(
      `SELECT AVG(value) AS avg_value
       FROM lifeos.health_metrics
       WHERE metric_type = $1
         AND CAST(recorded_at AS DATE) = CAST('${date}' AS DATE)`,
      metric,
    );

    const value =
      valueRows.length > 0 && valueRows[0].avg_value != null
        ? Math.round(valueRows[0].avg_value * 10) / 10
        : null;

    // Generate insights based on metric type
    let insights: Insight[];
    switch (metric) {
      case 'weight':
        insights = await getWeightInsights(date);
        break;
      case 'heart_rate':
        insights = await getHeartRateInsights(date);
        break;
      case 'sleep_duration':
      case 'sleep_quality':
        insights = await getSleepInsights(date);
        break;
      case 'hrv':
        insights = await getHrvInsights(date);
        break;
      case 'spo2':
        insights = await getSpo2Insights(date);
        break;
      case 'steps':
        insights = await getStepsInsights(date);
        break;
      default:
        insights = [];
    }

    res.json({
      data: {
        metric,
        date,
        value,
        insights,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
