import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../server.js';
import { VALID_METRIC_TYPES, validateMetric } from './health-webhook.js';
import type express from 'express';

// --- validateMetric unit tests ---

describe('validateMetric', () => {
  it('rejects null', () => {
    const result = validateMetric(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Metric must be an object');
  });

  it('rejects non-object', () => {
    const result = validateMetric('string');
    expect(result.valid).toBe(false);
  });

  it('rejects missing metric_type', () => {
    const result = validateMetric({
      value: 100,
      recorded_at: '2024-01-01T00:00:00Z',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid metric_type');
  });

  it('rejects invalid metric_type', () => {
    const result = validateMetric({
      metric_type: 'mood',
      value: 5,
      recorded_at: '2024-01-01T00:00:00Z',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid metric_type: mood');
  });

  it('rejects non-numeric value', () => {
    const result = validateMetric({
      metric_type: 'steps',
      value: 'abc',
      recorded_at: '2024-01-01T00:00:00Z',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('value must be a number');
  });

  it('rejects NaN value', () => {
    const result = validateMetric({
      metric_type: 'steps',
      value: NaN,
      recorded_at: '2024-01-01T00:00:00Z',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('value must be a number');
  });

  it('rejects missing recorded_at', () => {
    const result = validateMetric({ metric_type: 'steps', value: 100 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('recorded_at must be a valid ISO timestamp');
  });

  it('rejects invalid timestamp', () => {
    const result = validateMetric({
      metric_type: 'steps',
      value: 100,
      recorded_at: 'not-a-date',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('recorded_at must be a valid ISO timestamp');
  });

  it('accepts valid metric with all fields', () => {
    const result = validateMetric({
      metric_type: 'steps',
      value: 5000,
      unit: 'count',
      recorded_at: '2024-01-15T10:30:00Z',
      source: 'pixel_watch',
    });
    expect(result.valid).toBe(true);
    expect(result.metric).toEqual({
      metric_type: 'steps',
      value: 5000,
      unit: 'count',
      recorded_at: '2024-01-15T10:30:00Z',
      source: 'pixel_watch',
    });
  });

  it('defaults source to health_connect when not provided', () => {
    const result = validateMetric({
      metric_type: 'heart_rate',
      value: 72,
      recorded_at: '2024-01-15T10:30:00Z',
    });
    expect(result.valid).toBe(true);
    expect(result.metric!.source).toBe('health_connect');
  });

  it('sets unit to undefined when not provided', () => {
    const result = validateMetric({
      metric_type: 'weight',
      value: 75.5,
      recorded_at: '2024-01-15T10:30:00Z',
    });
    expect(result.valid).toBe(true);
    expect(result.metric!.unit).toBeUndefined();
  });

  it('accepts all 18 metric types', () => {
    for (const metricType of VALID_METRIC_TYPES) {
      const result = validateMetric({
        metric_type: metricType,
        value: 1,
        recorded_at: '2024-01-01T00:00:00Z',
      });
      expect(result.valid).toBe(true);
    }
  });
});

// --- HTTP endpoint integration tests ---

describe('POST /api/health-webhook', () => {
  let app: express.Express;

  beforeAll(() => {
    delete process.env.VPS_API_SECRET;
    app = createApiServer();
  });

  it('returns 200 with accepted: 1 for a valid single metric', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          {
            metric_type: 'steps',
            value: 5000,
            recorded_at: '2024-01-15T10:30:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
    expect(res.body.rejected).toBe(0);
    expect(res.body.errors).toBeUndefined();
  });

  it('returns correct count for multiple valid metrics', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          {
            metric_type: 'steps',
            value: 5000,
            recorded_at: '2024-01-15T10:30:00Z',
          },
          {
            metric_type: 'heart_rate',
            value: 72,
            recorded_at: '2024-01-15T10:30:00Z',
          },
          {
            metric_type: 'weight',
            value: 75.5,
            recorded_at: '2024-01-15T10:30:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(3);
    expect(res.body.rejected).toBe(0);
  });

  it('rejects invalid metric_type', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          {
            metric_type: 'mood',
            value: 5,
            recorded_at: '2024-01-15T10:30:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(0);
    expect(res.body.rejected).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].index).toBe(0);
    expect(res.body.errors[0].error).toContain('Invalid metric_type');
  });

  it('rejects non-numeric value', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          {
            metric_type: 'steps',
            value: 'abc',
            recorded_at: '2024-01-15T10:30:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.rejected).toBe(1);
    expect(res.body.errors[0].error).toBe('value must be a number');
  });

  it('rejects invalid timestamp', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          { metric_type: 'steps', value: 100, recorded_at: 'not-a-date' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.rejected).toBe(1);
    expect(res.body.errors[0].error).toBe(
      'recorded_at must be a valid ISO timestamp',
    );
  });

  it('returns 400 when metrics array is missing', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({ data: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body must contain a metrics array');
  });

  it('returns 400 when metrics is not an array', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({ metrics: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body must contain a metrics array');
  });

  it('partially accepts a mix of valid and invalid metrics', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          {
            metric_type: 'steps',
            value: 5000,
            recorded_at: '2024-01-15T10:30:00Z',
          },
          {
            metric_type: 'invalid_type',
            value: 1,
            recorded_at: '2024-01-15T10:30:00Z',
          },
          {
            metric_type: 'heart_rate',
            value: 72,
            recorded_at: '2024-01-15T10:30:00Z',
          },
          {
            metric_type: 'weight',
            value: 'not_number',
            recorded_at: '2024-01-15T10:30:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(2);
    expect(res.body.rejected).toBe(2);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors[0].index).toBe(1);
    expect(res.body.errors[1].index).toBe(3);
  });

  it('accepts all 18 metric types via HTTP', async () => {
    const metrics = VALID_METRIC_TYPES.map((mt) => ({
      metric_type: mt,
      value: 1,
      recorded_at: '2024-01-15T10:30:00Z',
    }));

    const res = await request(app)
      .post('/api/health-webhook')
      .send({ metrics });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(18);
    expect(res.body.rejected).toBe(0);
  });
});

describe('GET /api/health-webhook/metrics', () => {
  let app: express.Express;

  beforeAll(() => {
    delete process.env.VPS_API_SECRET;
    app = createApiServer();
  });

  it('returns list of valid metric types', async () => {
    const res = await request(app).get('/api/health-webhook/metrics');

    expect(res.status).toBe(200);
    expect(res.body.metric_types).toEqual(VALID_METRIC_TYPES);
    expect(res.body.metric_types).toHaveLength(18);
  });
});

describe('API key middleware', () => {
  afterAll(() => {
    delete process.env.VPS_API_SECRET;
  });

  it('returns 401 when VPS_API_SECRET is set and no key is provided', async () => {
    process.env.VPS_API_SECRET = 'test-secret-key';
    const app = createApiServer();

    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          {
            metric_type: 'steps',
            value: 100,
            recorded_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 when the wrong key is provided', async () => {
    process.env.VPS_API_SECRET = 'test-secret-key';
    const app = createApiServer();

    const res = await request(app)
      .post('/api/health-webhook')
      .set('x-api-key', 'wrong-key')
      .send({
        metrics: [
          {
            metric_type: 'steps',
            value: 100,
            recorded_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

    expect(res.status).toBe(401);
  });

  it('passes when the correct key is provided via header', async () => {
    process.env.VPS_API_SECRET = 'test-secret-key';
    const app = createApiServer();

    const res = await request(app)
      .post('/api/health-webhook')
      .set('x-api-key', 'test-secret-key')
      .send({
        metrics: [
          {
            metric_type: 'steps',
            value: 100,
            recorded_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });

  it('passes when the correct key is provided via query param', async () => {
    process.env.VPS_API_SECRET = 'test-secret-key';
    const app = createApiServer();

    const res = await request(app)
      .post('/api/health-webhook?key=test-secret-key')
      .send({
        metrics: [
          {
            metric_type: 'steps',
            value: 100,
            recorded_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });

  it('does not require key when VPS_API_SECRET is not set', async () => {
    delete process.env.VPS_API_SECRET;
    const app = createApiServer();

    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          {
            metric_type: 'steps',
            value: 100,
            recorded_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });
});
