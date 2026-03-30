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

/**
 * Transform Health Connect Webhook app payload into normalized metrics.
 *
 * The app sends data grouped by type:
 *   { steps: [{count, start_time, end_time}], heart_rate: [{bpm, time}], ... }
 *
 * We normalize into flat metrics:
 *   [{metric_type: "steps", value: 840, recorded_at: "..."}]
 */
export function transformHealthConnectPayload(
  body: Record<string, unknown>,
): HealthMetricPayload[] {
  const metrics: HealthMetricPayload[] = [];

  // Steps: {count, start_time, end_time}
  if (Array.isArray(body.steps)) {
    for (const entry of body.steps) {
      const e = entry as Record<string, unknown>;
      metrics.push({
        metric_type: 'steps',
        value: Number(e.count ?? 0),
        recorded_at: String(e.end_time ?? e.start_time ?? ''),
        source: 'health_connect',
      });
    }
  }

  // Heart rate: {bpm, time}
  if (Array.isArray(body.heart_rate)) {
    for (const entry of body.heart_rate) {
      const e = entry as Record<string, unknown>;
      metrics.push({
        metric_type: 'heart_rate',
        value: Number(e.bpm ?? 0),
        recorded_at: String(e.time ?? ''),
        source: 'health_connect',
      });
    }
  }

  // Sleep: {duration_hours, start_time, end_time} or {duration, ...}
  if (Array.isArray(body.sleep)) {
    for (const entry of body.sleep) {
      const e = entry as Record<string, unknown>;
      const duration = Number(e.duration_hours ?? e.duration ?? 0);
      metrics.push({
        metric_type: 'sleep_duration',
        value: duration,
        unit: 'hours',
        recorded_at: String(e.end_time ?? e.start_time ?? ''),
        source: 'health_connect',
      });
    }
  }

  // Weight: {weight_kg, time} or {value, time}
  if (Array.isArray(body.weight)) {
    for (const entry of body.weight) {
      const e = entry as Record<string, unknown>;
      metrics.push({
        metric_type: 'weight',
        value: Number(e.weight_kg ?? e.value ?? 0),
        unit: 'kg',
        recorded_at: String(e.time ?? ''),
        source: 'health_connect',
      });
    }
  }

  // Blood pressure: {systolic, diastolic, time}
  if (Array.isArray(body.blood_pressure)) {
    for (const entry of body.blood_pressure) {
      const e = entry as Record<string, unknown>;
      metrics.push({
        metric_type: 'blood_pressure',
        value: Number(e.systolic ?? 0),
        unit: `${e.systolic}/${e.diastolic}`,
        recorded_at: String(e.time ?? ''),
        source: 'health_connect',
      });
    }
  }

  // SpO2: {percentage, time}
  if (Array.isArray(body.spo2)) {
    for (const entry of body.spo2) {
      const e = entry as Record<string, unknown>;
      metrics.push({
        metric_type: 'spo2',
        value: Number(e.percentage ?? e.value ?? 0),
        recorded_at: String(e.time ?? ''),
        source: 'health_connect',
      });
    }
  }

  // HRV: {hrv_ms, time} or {value, time}
  if (Array.isArray(body.hrv)) {
    for (const entry of body.hrv) {
      const e = entry as Record<string, unknown>;
      metrics.push({
        metric_type: 'hrv',
        value: Number(e.hrv_ms ?? e.value ?? 0),
        unit: 'ms',
        recorded_at: String(e.time ?? ''),
        source: 'health_connect',
      });
    }
  }

  // Active calories: {calories, start_time, end_time}
  if (Array.isArray(body.active_calories)) {
    for (const entry of body.active_calories) {
      const e = entry as Record<string, unknown>;
      metrics.push({
        metric_type: 'active_calories',
        value: Number(e.calories ?? e.value ?? 0),
        unit: 'kcal',
        recorded_at: String(e.end_time ?? e.start_time ?? ''),
        source: 'health_connect',
      });
    }
  }

  // Distance: {distance_meters, start_time, end_time}
  if (Array.isArray(body.distance)) {
    for (const entry of body.distance) {
      const e = entry as Record<string, unknown>;
      metrics.push({
        metric_type: 'distance',
        value: Number(e.distance_meters ?? e.value ?? 0),
        unit: 'meters',
        recorded_at: String(e.end_time ?? e.start_time ?? ''),
        source: 'health_connect',
      });
    }
  }

  // Generic handler for any other keys with array values
  const handled = new Set([
    'steps',
    'heart_rate',
    'sleep',
    'weight',
    'blood_pressure',
    'spo2',
    'hrv',
    'active_calories',
    'distance',
    'timestamp',
    'app_version',
  ]);
  for (const [key, val] of Object.entries(body)) {
    if (handled.has(key) || !Array.isArray(val)) continue;
    for (const entry of val) {
      const e = entry as Record<string, unknown>;
      const value = Number(e.value ?? e.count ?? e.bpm ?? e.percentage ?? 0);
      const time = String(
        e.time ?? e.end_time ?? e.start_time ?? e.recorded_at ?? '',
      );
      if (value && time) {
        metrics.push({
          metric_type: key,
          value,
          recorded_at: time,
          source: 'health_connect',
        });
      }
    }
  }

  return metrics;
}

// POST /api/health-webhook
healthWebhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    // Handle body that might arrive as string (missing Content-Type: application/json)
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

    // Support both formats:
    // 1. Our format: { metrics: [{metric_type, value, recorded_at}] }
    // 2. Health Connect Webhook app: { steps: [...], heart_rate: [...], ... }
    if (Array.isArray(body.metrics)) {
      metrics = body.metrics as HealthMetricPayload[];
    } else {
      metrics = transformHealthConnectPayload(body);
    }

    if (metrics.length === 0) {
      res.status(400).json({ error: 'No metrics found in request body' });
      return;
    }

  // Respond immediately to avoid phone app timeout, then insert in background
  const total = metrics.length;
  res.status(200).json({ accepted: total, rejected: 0 });

  // Background insert — don't await, fire and forget
  (async () => {
    let accepted = 0;
    let rejected = 0;
    for (const metric of metrics) {
      const id = crypto.randomUUID();
      const source = metric.source || 'health_connect';
      try {
        await query(
          `INSERT INTO lifeos.health_metrics (id, metric_type, value, unit, recorded_at, source, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          id,
          metric.metric_type,
          metric.value,
          metric.unit ?? null,
          metric.recorded_at,
          source,
        );
        accepted++;
      } catch (err: unknown) {
        rejected++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error(
          { metric_type: metric.metric_type, error: message },
          'Failed to write health metric',
        );
      }
    }
    logger.info({ accepted, rejected, total }, 'Health webhook batch complete');
  })().catch((err: unknown) => {
    logger.error({ err }, 'Health webhook background insert failed');
  });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err: message, body: req.body }, 'Health webhook handler error');
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
