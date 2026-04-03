import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { logger } from '../../logger.js';
import crypto from 'crypto';

export const healthWebhookRouter = Router();

export interface HealthMetricPayload {
  metric_type: string;
  value: number;
  unit?: string;
  recorded_at: string;
  source?: string;
}

type MetricHandler = (e: Record<string, unknown>) => {
  type: string;
  value: number;
  unit?: string;
  time: string;
}[];

const METRIC_HANDLERS: Record<string, MetricHandler> = {
  steps: (e) => [
    {
      type: 'steps',
      value: Number(e.count ?? 0),
      time: String(e.end_time ?? e.start_time ?? ''),
    },
  ],
  heart_rate: (e) => [
    {
      type: 'heart_rate',
      value: Number(e.bpm ?? 0),
      time: String(e.time ?? ''),
    },
  ],
  sleep: (e) => {
    const duration =
      e.duration_seconds != null
        ? Number(e.duration_seconds) / 3600
        : Number(e.duration_hours ?? e.duration ?? e.value ?? 0);
    return [
      {
        type: 'sleep_duration',
        value: Math.round(duration * 100) / 100,
        unit: 'hours',
        time: String(
          e.session_end_time ??
            e.end_time ??
            e.start_time ??
            e.time ??
            new Date().toISOString(),
        ),
      },
    ];
  },
  weight: (e) => [
    {
      type: 'weight',
      value: Number(e.weight_kg ?? e.value ?? 0),
      unit: 'kg',
      time: String(e.time ?? ''),
    },
  ],
  blood_pressure: (e) => [
    {
      type: 'blood_pressure',
      value: Number(e.systolic ?? 0),
      unit: `${e.systolic}/${e.diastolic}`,
      time: String(e.time ?? ''),
    },
  ],
  spo2: (e) => [
    {
      type: 'spo2',
      value: Number(e.percentage ?? e.value ?? 0),
      time: String(e.time ?? ''),
    },
  ],
  hrv: (e) => [
    {
      type: 'hrv',
      value: Number(e.hrv_ms ?? e.value ?? 0),
      unit: 'ms',
      time: String(e.time ?? ''),
    },
  ],
  active_calories: (e) => [
    {
      type: 'active_calories',
      value: Number(e.calories ?? e.value ?? 0),
      unit: 'kcal',
      time: String(e.end_time ?? e.start_time ?? ''),
    },
  ],
  distance: (e) => [
    {
      type: 'distance',
      value: Number(e.distance_meters ?? e.value ?? 0),
      unit: 'meters',
      time: String(e.end_time ?? e.start_time ?? ''),
    },
  ],
};

const METRIC_NAME_MAP: Record<string, string> = { oxygen_saturation: 'spo2' };
const SKIP_KEYS = new Set([
  ...Object.keys(METRIC_HANDLERS),
  'timestamp',
  'app_version',
]);

/**
 * Transform Health Connect Webhook app payload into normalized metrics.
 */
export function transformHealthConnectPayload(
  body: Record<string, unknown>,
): HealthMetricPayload[] {
  const metrics: HealthMetricPayload[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (!Array.isArray(val)) continue;
    const handler = METRIC_HANDLERS[key];
    if (handler) {
      for (const entry of val) {
        const results = handler(entry as Record<string, unknown>);
        for (const m of results) {
          metrics.push({
            metric_type: m.type,
            value: m.value,
            unit: m.unit,
            recorded_at: m.time,
            source: 'health_connect',
          });
        }
      }
    } else if (!SKIP_KEYS.has(key)) {
      const normalizedName = METRIC_NAME_MAP[key] ?? key;
      for (const entry of val) {
        const e = entry as Record<string, unknown>;
        const value = Number(e.value ?? e.count ?? e.bpm ?? e.percentage ?? 0);
        const time = String(
          e.time ?? e.end_time ?? e.start_time ?? e.recorded_at ?? '',
        );
        if (value && time) {
          metrics.push({
            metric_type: normalizedName,
            value,
            recorded_at: time,
            source: 'health_connect',
          });
        }
      }
    }
  }

  return metrics;
}

// POST /api/health-webhook
healthWebhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    let body: Record<string, unknown>;
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body) as Record<string, unknown>;
      } catch {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
      }
    } else {
      body = (req.body ?? {}) as Record<string, unknown>;
    }

    logger.info(
      { keys: Object.keys(body), contentType: req.headers['content-type'] },
      'Health webhook received',
    );

    let metrics: HealthMetricPayload[];
    if (Array.isArray(body.metrics)) {
      metrics = body.metrics as HealthMetricPayload[];
    } else {
      metrics = transformHealthConnectPayload(body);
    }

    if (metrics.length === 0) {
      res.status(400).json({ error: 'No metrics found in request body' });
      return;
    }

    const total = metrics.length;
    res.status(200).json({ accepted: total, rejected: 0 });

    // Background insert -- fire and forget
    (async () => {
      let accepted = 0;
      let rejected = 0;
      for (const metric of metrics) {
        try {
          await query(
            `INSERT INTO lifeos.health_metrics (id, metric_type, value, unit, recorded_at, source, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
            crypto.randomUUID(),
            metric.metric_type,
            metric.value,
            metric.unit ?? null,
            metric.recorded_at,
            metric.source || 'health_connect',
          );
          accepted++;
        } catch (err: unknown) {
          rejected++;
          logger.error(
            {
              metric_type: metric.metric_type,
              error: err instanceof Error ? err.message : 'Unknown error',
            },
            'Failed to write health metric',
          );
        }
      }
      logger.info(
        { accepted, rejected, total },
        'Health webhook batch complete',
      );
    })().catch((err: unknown) => {
      logger.error({ err }, 'Health webhook background insert failed');
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error(
      { err: message, body: req.body },
      'Health webhook handler error',
    );
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

// GET /api/health-webhook/metrics -- list valid metric types
healthWebhookRouter.get('/metrics', (_req: Request, res: Response) => {
  res.json({
    metric_types: [
      'steps',
      'heart_rate',
      'hrv',
      'blood_pressure',
      'spo2',
      'weight',
      'sleep_duration',
      'sleep_quality',
      'respiratory_rate',
      'body_temp',
      'blood_glucose',
      'active_calories',
      'total_calories',
      'distance',
      'elevation',
      'floors',
      'exercise_session',
      'hydration',
    ],
  });
});
