import { Router, Request, Response } from 'express';
import { logger } from '../../logger.js';
import crypto from 'crypto';

export const healthWebhookRouter = Router();

// All 18 Health Connect metric types
export const VALID_METRIC_TYPES = [
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
] as const;

export type MetricType = (typeof VALID_METRIC_TYPES)[number];

export interface HealthMetricPayload {
  metric_type: MetricType;
  value: number;
  unit?: string;
  recorded_at: string; // ISO timestamp
  source?: string;
}

export interface HealthWebhookBody {
  metrics: HealthMetricPayload[];
}

// Validate a single metric
export function validateMetric(metric: unknown): {
  valid: boolean;
  error?: string;
  metric?: HealthMetricPayload;
} {
  if (!metric || typeof metric !== 'object')
    return { valid: false, error: 'Metric must be an object' };
  const m = metric as Record<string, unknown>;

  if (
    !m.metric_type ||
    !VALID_METRIC_TYPES.includes(m.metric_type as MetricType)
  ) {
    return {
      valid: false,
      error: `Invalid metric_type: ${String(m.metric_type)}. Valid types: ${VALID_METRIC_TYPES.join(', ')}`,
    };
  }
  if (typeof m.value !== 'number' || isNaN(m.value)) {
    return { valid: false, error: 'value must be a number' };
  }
  if (!m.recorded_at || isNaN(Date.parse(m.recorded_at as string))) {
    return { valid: false, error: 'recorded_at must be a valid ISO timestamp' };
  }

  return {
    valid: true,
    metric: {
      metric_type: m.metric_type as MetricType,
      value: m.value as number,
      unit: (m.unit as string) || undefined,
      recorded_at: m.recorded_at as string,
      source: (m.source as string) || 'health_connect',
    },
  };
}

// POST /api/health-webhook
healthWebhookRouter.post('/', (req: Request, res: Response) => {
  const body = req.body as HealthWebhookBody;

  if (!body.metrics || !Array.isArray(body.metrics)) {
    res
      .status(400)
      .json({ error: 'Request body must contain a metrics array' });
    return;
  }

  const results: {
    accepted: HealthMetricPayload[];
    rejected: { index: number; error: string }[];
  } = {
    accepted: [],
    rejected: [],
  };

  for (let i = 0; i < body.metrics.length; i++) {
    const validation = validateMetric(body.metrics[i]);
    if (validation.valid && validation.metric) {
      // Generate ID for tracking (MotherDuck integration will be added later)
      const _metricWithId = {
        id: crypto.randomUUID(),
        ...validation.metric,
        created_at: new Date().toISOString(),
      };
      results.accepted.push(validation.metric);
      logger.info(
        {
          metric_type: validation.metric.metric_type,
          value: validation.metric.value,
        },
        'Health metric received',
      );
    } else {
      results.rejected.push({
        index: i,
        error: validation.error || 'Unknown error',
      });
    }
  }

  res.status(200).json({
    accepted: results.accepted.length,
    rejected: results.rejected.length,
    errors: results.rejected.length > 0 ? results.rejected : undefined,
  });
});

// GET /api/health-webhook/metrics -- list valid metric types
healthWebhookRouter.get('/metrics', (_req: Request, res: Response) => {
  res.json({ metric_types: VALID_METRIC_TYPES });
});
