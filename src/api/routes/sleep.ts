import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const sleepRouter = Router();

interface SleepMetricRow {
  metric_type: string;
  value: number;
  unit: string | null;
  recorded_at: string;
}

interface SleepHistoryRow {
  date: string;
  metric_type: string;
  value: number;
}

interface SupplementAvgRow {
  supplement_name: string;
  taken_avg: number;
  not_taken_avg: number;
  taken_days: number;
  not_taken_days: number;
}

interface StepsSleepRow {
  step_category: string;
  avg_sleep: number;
  day_count: number;
}

interface Insight {
  text: string;
  type: 'positive' | 'negative' | 'neutral';
  source: string;
}

/**
 * GET /sleep/latest
 * Returns the most recent sleep entries (duration + quality).
 */
sleepRouter.get('/latest', async (_req: Request, res: Response) => {
  try {
    const rows = await query<SleepMetricRow>(
      `SELECT metric_type, value, unit, recorded_at
       FROM lifeos.health_metrics
       WHERE metric_type IN ('sleep_duration', 'sleep_quality')
       ORDER BY recorded_at DESC
       LIMIT 10`,
    );
    res.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /sleep/history?days=30
 * Returns daily sleep duration and quality for charting.
 */
sleepRouter.get('/history', async (req: Request, res: Response) => {
  const daysParam = req.query.days;
  const days = daysParam ? Number(daysParam) : 30;

  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: 'days must be a number between 1 and 365' });
    return;
  }

  try {
    const rows = await query<SleepHistoryRow>(
      `SELECT CAST(recorded_at AS DATE) AS date, metric_type, AVG(value) AS value
       FROM lifeos.health_metrics
       WHERE metric_type IN ('sleep_duration', 'sleep_quality')
         AND recorded_at >= CURRENT_DATE - INTERVAL '${String(days)}' DAY
       GROUP BY CAST(recorded_at AS DATE), metric_type
       ORDER BY date ASC`,
    );
    res.json({ data: rows, days });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message, days });
  }
});

/**
 * GET /sleep/insights
 * Correlates sleep with supplements and activity.
 */
sleepRouter.get('/insights', async (_req: Request, res: Response) => {
  try {
    const insights: Insight[] = [];

    // --- Melatonin correlation ---
    const melatoninRows = await query<SupplementAvgRow>(
      `WITH sleep_dates AS (
         SELECT CAST(recorded_at AS DATE) AS d, AVG(value) AS sleep_hrs
         FROM lifeos.health_metrics
         WHERE metric_type = 'sleep_duration'
         GROUP BY CAST(recorded_at AS DATE)
       ),
       mel_days AS (
         SELECT sl.log_date AS d, sl.taken
         FROM lifeos.supplement_log sl
         JOIN lifeos.supplements s ON s.id = sl.supplement_id
         WHERE LOWER(s.name) LIKE '%melatonin%'
       )
       SELECT
         'melatonin' AS supplement_name,
         AVG(CASE WHEN m.taken = true THEN sd.sleep_hrs END) AS taken_avg,
         AVG(CASE WHEN m.taken IS NULL OR m.taken = false THEN sd.sleep_hrs END) AS not_taken_avg,
         COUNT(CASE WHEN m.taken = true THEN 1 END) AS taken_days,
         COUNT(CASE WHEN m.taken IS NULL OR m.taken = false THEN 1 END) AS not_taken_days
       FROM sleep_dates sd
       LEFT JOIN mel_days m ON sd.d = m.d`,
    );

    if (melatoninRows.length > 0) {
      const row = melatoninRows[0];
      if (
        row.taken_avg != null &&
        row.not_taken_avg != null &&
        row.taken_days > 0
      ) {
        const diff = row.taken_avg - row.not_taken_avg;
        const diffMin = Math.round(Math.abs(diff) * 60);
        if (diff > 0) {
          insights.push({
            text: `Melatonin nights: avg ${row.taken_avg.toFixed(1)}h vs ${row.not_taken_avg.toFixed(1)}h without (+${diffMin}min)`,
            type: 'positive',
            source: 'supplement_log + health_metrics',
          });
        } else if (diff < 0) {
          insights.push({
            text: `Melatonin nights: avg ${row.taken_avg.toFixed(1)}h vs ${row.not_taken_avg.toFixed(1)}h without`,
            type: 'neutral',
            source: 'supplement_log + health_metrics',
          });
        }
      }
    }

    // --- Magnesium correlation ---
    const magnesiumRows = await query<SupplementAvgRow>(
      `WITH sleep_dates AS (
         SELECT CAST(recorded_at AS DATE) AS d, AVG(value) AS sleep_hrs
         FROM lifeos.health_metrics
         WHERE metric_type = 'sleep_duration'
         GROUP BY CAST(recorded_at AS DATE)
       ),
       mag_days AS (
         SELECT sl.log_date AS d, sl.taken
         FROM lifeos.supplement_log sl
         JOIN lifeos.supplements s ON s.id = sl.supplement_id
         WHERE LOWER(s.name) LIKE '%magnesium%'
       )
       SELECT
         'magnesium' AS supplement_name,
         AVG(CASE WHEN m.taken = true THEN sd.sleep_hrs END) AS taken_avg,
         AVG(CASE WHEN m.taken IS NULL OR m.taken = false THEN sd.sleep_hrs END) AS not_taken_avg,
         COUNT(CASE WHEN m.taken = true THEN 1 END) AS taken_days,
         COUNT(CASE WHEN m.taken IS NULL OR m.taken = false THEN 1 END) AS not_taken_days
       FROM sleep_dates sd
       LEFT JOIN mag_days m ON sd.d = m.d`,
    );

    if (magnesiumRows.length > 0) {
      const row = magnesiumRows[0];
      if (
        row.taken_avg != null &&
        row.not_taken_avg != null &&
        row.taken_days > 0
      ) {
        const diff = row.taken_avg - row.not_taken_avg;
        const diffMin = Math.round(Math.abs(diff) * 60);
        if (diff > 0) {
          insights.push({
            text: `Magnesium nights: avg ${row.taken_avg.toFixed(1)}h vs ${row.not_taken_avg.toFixed(1)}h without (+${diffMin}min)`,
            type: 'positive',
            source: 'supplement_log + health_metrics',
          });
        } else {
          insights.push({
            text: `Magnesium nights: avg ${row.taken_avg.toFixed(1)}h vs ${row.not_taken_avg.toFixed(1)}h without`,
            type: 'neutral',
            source: 'supplement_log + health_metrics',
          });
        }
      }
    }

    // --- Steps vs sleep correlation ---
    const stepsRows = await query<StepsSleepRow>(
      `WITH daily_steps AS (
         SELECT CAST(recorded_at AS DATE) AS d, AVG(value) AS steps
         FROM lifeos.health_metrics
         WHERE metric_type = 'steps'
         GROUP BY CAST(recorded_at AS DATE)
       ),
       daily_sleep AS (
         SELECT CAST(recorded_at AS DATE) AS d, AVG(value) AS sleep_hrs
         FROM lifeos.health_metrics
         WHERE metric_type = 'sleep_duration'
         GROUP BY CAST(recorded_at AS DATE)
       )
       SELECT
         CASE WHEN ds.steps >= 5000 THEN 'high' ELSE 'low' END AS step_category,
         AVG(sl.sleep_hrs) AS avg_sleep,
         COUNT(*) AS day_count
       FROM daily_steps ds
       JOIN daily_sleep sl ON ds.d = sl.d
       GROUP BY CASE WHEN ds.steps >= 5000 THEN 'high' ELSE 'low' END`,
    );

    const highSteps = stepsRows.find((r) => r.step_category === 'high');
    const lowSteps = stepsRows.find((r) => r.step_category === 'low');

    if (
      highSteps &&
      lowSteps &&
      highSteps.avg_sleep != null &&
      lowSteps.avg_sleep != null
    ) {
      const diff = highSteps.avg_sleep - lowSteps.avg_sleep;
      const diffMin = Math.round(Math.abs(diff) * 60);
      if (diff > 0) {
        insights.push({
          text: `You sleep ${diffMin}min longer on days with 5000+ steps`,
          type: 'positive',
          source: 'health_metrics',
        });
      } else if (diff < 0) {
        insights.push({
          text: `You sleep ${diffMin}min less on high-step days (5000+)`,
          type: 'neutral',
          source: 'health_metrics',
        });
      }
    }

    // --- Weekly goal tracking ---
    const goalRows = await query<{
      nights_on_target: number;
      avg_duration: number;
    }>(
      `SELECT
         COUNT(CASE WHEN avg_sleep >= 7 AND avg_sleep <= 9 THEN 1 END) AS nights_on_target,
         AVG(avg_sleep) AS avg_duration
       FROM (
         SELECT CAST(recorded_at AS DATE) AS d, AVG(value) AS avg_sleep
         FROM lifeos.health_metrics
         WHERE metric_type = 'sleep_duration'
           AND recorded_at >= CURRENT_DATE - INTERVAL '7' DAY
         GROUP BY CAST(recorded_at AS DATE)
       ) sub`,
    );

    if (goalRows.length > 0 && goalRows[0].avg_duration != null) {
      const { nights_on_target, avg_duration } = goalRows[0];
      insights.push({
        text: `Weekly avg: ${avg_duration.toFixed(1)}h — ${nights_on_target} of 7 nights hitting 7-9h target`,
        type:
          nights_on_target >= 5
            ? 'positive'
            : nights_on_target >= 3
              ? 'neutral'
              : 'negative',
        source: 'health_metrics',
      });
    }

    // --- Sleep quality average ---
    const qualityRows = await query<{ avg_quality: number }>(
      `SELECT AVG(value) AS avg_quality
       FROM lifeos.health_metrics
       WHERE metric_type = 'sleep_quality'
         AND recorded_at >= CURRENT_DATE - INTERVAL '7' DAY`,
    );

    if (qualityRows.length > 0 && qualityRows[0].avg_quality != null) {
      const avg = qualityRows[0].avg_quality;
      insights.push({
        text: `7-day sleep quality avg: ${Math.round(avg)}/100`,
        type: avg >= 75 ? 'positive' : avg >= 50 ? 'neutral' : 'negative',
        source: 'health_metrics',
      });
    }

    res.json({ data: insights });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
