import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../server.js';
import type express from 'express';

// --- Our format (metrics array) ---

describe('POST /api/health-webhook (our format)', () => {
  let app: express.Express;

  beforeAll(() => {
    delete process.env.VPS_API_SECRET;
    app = createApiServer();
  });

  it('accepts a single valid metric', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          { metric_type: 'steps', value: 5000, recorded_at: '2024-01-15T10:30:00Z' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
    expect(res.body.rejected).toBe(0);
  });

  it('accepts multiple valid metrics', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        metrics: [
          { metric_type: 'steps', value: 5000, recorded_at: '2024-01-15T10:30:00Z' },
          { metric_type: 'heart_rate', value: 72, recorded_at: '2024-01-15T10:30:00Z' },
          { metric_type: 'weight', value: 75.5, recorded_at: '2024-01-15T10:30:00Z' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(3);
  });
});

// --- Health Connect Webhook app format ---

describe('POST /api/health-webhook (Health Connect format)', () => {
  let app: express.Express;

  beforeAll(() => {
    delete process.env.VPS_API_SECRET;
    app = createApiServer();
  });

  it('accepts steps data from Health Connect', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        timestamp: '2026-03-29T22:20:34Z',
        app_version: '1.0',
        steps: [
          { count: 840, start_time: '2026-03-27T06:00:00Z', end_time: '2026-03-28T06:00:00Z' },
          { count: 3496, start_time: '2026-03-28T06:00:00Z', end_time: '2026-03-29T06:00:00Z' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(2);
  });

  it('accepts heart rate data from Health Connect', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        timestamp: '2026-03-29T22:20:34Z',
        heart_rate: [
          { bpm: 91, time: '2026-03-27T22:30:29Z' },
          { bpm: 72, time: '2026-03-28T18:00:29Z' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(2);
  });

  it('accepts mixed Health Connect data (steps + heart_rate)', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        timestamp: '2026-03-29T22:20:34Z',
        app_version: '1.0',
        steps: [
          { count: 840, start_time: '2026-03-27T06:00:00Z', end_time: '2026-03-28T06:00:00Z' },
        ],
        heart_rate: [
          { bpm: 91, time: '2026-03-27T22:30:29Z' },
          { bpm: 72, time: '2026-03-28T18:00:29Z' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(3);
  });

  it('accepts sleep data', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        sleep: [
          { duration_hours: 7.5, start_time: '2026-03-28T23:00:00Z', end_time: '2026-03-29T06:30:00Z' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });

  it('accepts weight data', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        weight: [{ weight_kg: 75.2, time: '2026-03-29T08:00:00Z' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });

  it('returns 400 when body has no recognizable data', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({ timestamp: '2026-03-29T22:20:34Z', app_version: '1.0' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No metrics found in request body');
  });

  it('handles unknown metric types generically', async () => {
    const res = await request(app)
      .post('/api/health-webhook')
      .send({
        respiratory_rate: [{ value: 16, time: '2026-03-29T10:00:00Z' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });
});

// --- GET /api/health-webhook/metrics ---

describe('GET /api/health-webhook/metrics', () => {
  let app: express.Express;

  beforeAll(() => {
    delete process.env.VPS_API_SECRET;
    app = createApiServer();
  });

  it('returns list of valid metric types', async () => {
    const res = await request(app).get('/api/health-webhook/metrics');

    expect(res.status).toBe(200);
    expect(res.body.metric_types).toHaveLength(18);
    expect(res.body.metric_types).toContain('steps');
    expect(res.body.metric_types).toContain('heart_rate');
  });
});

// --- API key middleware ---

describe('API key middleware', () => {
  afterAll(() => {
    delete process.env.VPS_API_SECRET;
  });

  it('returns 401 when VPS_API_SECRET is set and no key provided', async () => {
    process.env.VPS_API_SECRET = 'test-secret-key';
    const app = createApiServer();

    const res = await request(app)
      .post('/api/health-webhook')
      .send({ metrics: [{ metric_type: 'steps', value: 100, recorded_at: '2024-01-01T00:00:00Z' }] });

    expect(res.status).toBe(401);
  });

  it('returns 401 when wrong key provided', async () => {
    process.env.VPS_API_SECRET = 'test-secret-key';
    const app = createApiServer();

    const res = await request(app)
      .post('/api/health-webhook')
      .set('x-api-key', 'wrong-key')
      .send({ metrics: [{ metric_type: 'steps', value: 100, recorded_at: '2024-01-01T00:00:00Z' }] });

    expect(res.status).toBe(401);
  });

  it('passes with correct key via header', async () => {
    process.env.VPS_API_SECRET = 'test-secret-key';
    const app = createApiServer();

    const res = await request(app)
      .post('/api/health-webhook')
      .set('x-api-key', 'test-secret-key')
      .send({ metrics: [{ metric_type: 'steps', value: 100, recorded_at: '2024-01-01T00:00:00Z' }] });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });

  it('does not require key when VPS_API_SECRET is not set', async () => {
    delete process.env.VPS_API_SECRET;
    const app = createApiServer();

    const res = await request(app)
      .post('/api/health-webhook')
      .send({ metrics: [{ metric_type: 'steps', value: 100, recorded_at: '2024-01-01T00:00:00Z' }] });

    expect(res.status).toBe(200);
  });
});
