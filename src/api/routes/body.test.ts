import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../db.js', () => ({
  query: mockQuery,
  getDb: vi.fn(),
}));

import { bodyRouter } from './body.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/body', bodyRouter);
  return app;
}

describe('body routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /body/latest', () => {
    it('returns latest value per metric using window function', async () => {
      mockQuery.mockResolvedValue([
        {
          metric_type: 'weight',
          value: 75.2,
          unit: 'kg',
          recorded_at: '2026-03-29T08:00:00Z',
        },
        {
          metric_type: 'body_fat',
          value: 18.5,
          unit: '%',
          recorded_at: '2026-03-29T08:00:00Z',
        },
        {
          metric_type: 'muscle_mass',
          value: 42.3,
          unit: '%',
          recorded_at: '2026-03-29T08:00:00Z',
        },
        {
          metric_type: 'bmi',
          value: 23.1,
          unit: null,
          recorded_at: '2026-03-29T08:00:00Z',
        },
        {
          metric_type: 'body_water',
          value: 55.0,
          unit: '%',
          recorded_at: '2026-03-29T08:00:00Z',
        },
        {
          metric_type: 'bmr',
          value: 1750,
          unit: 'kcal',
          recorded_at: '2026-03-29T08:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/body/latest');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(6);
      expect(res.body.data[0].metric_type).toBe('weight');
      expect(res.body.data[0].value).toBe(75.2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ROW_NUMBER()'),
      );
    });

    it('returns empty array when no data', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/body/latest');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB connection failed'));

      const res = await request(createApp()).get('/body/latest');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB connection failed');
    });
  });

  describe('GET /body/history', () => {
    it('returns history with default 90 days', async () => {
      mockQuery.mockResolvedValue([
        {
          date: '2026-03-28',
          metric_type: 'weight',
          avg_value: 75.0,
        },
        {
          date: '2026-03-28',
          metric_type: 'body_fat',
          avg_value: 18.5,
        },
      ]);

      const res = await request(createApp()).get('/body/history');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(90);
      expect(res.body.data).toHaveLength(2);
    });

    it('accepts custom days parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/body/history?days=30');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(30);
    });

    it('returns 400 for invalid days', async () => {
      const res = await request(createApp()).get('/body/history?days=abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('days must be');
    });

    it('returns 400 for days out of range (0)', async () => {
      const res = await request(createApp()).get('/body/history?days=0');

      expect(res.status).toBe(400);
    });

    it('returns 400 for days exceeding 365', async () => {
      const res = await request(createApp()).get('/body/history?days=500');

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const res = await request(createApp()).get('/body/history?days=30');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Query timeout');
    });
  });

  describe('POST /body/log', () => {
    it('inserts weight metric', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/body/log')
        .send({ weight_kg: 75.2 });

      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.health_metrics'),
        expect.any(String),
        'weight',
        75.2,
        'kg',
        expect.any(String),
        'manual',
      );
    });

    it('inserts multiple metrics at once', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/body/log').send({
        weight_kg: 75.2,
        body_fat_pct: 18.5,
        muscle_mass_pct: 42.3,
        body_water_pct: 55.0,
      });

      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(4);
    });

    it('returns 400 when no metrics provided', async () => {
      const res = await request(createApp()).post('/body/log').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('At least one');
    });

    it('returns 400 when non-numeric value provided', async () => {
      const res = await request(createApp())
        .post('/body/log')
        .send({ weight_kg: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('must be a number');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Insert failed'));

      const res = await request(createApp())
        .post('/body/log')
        .send({ weight_kg: 75.2 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Insert failed');
    });

    it('accepts optional notes field', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/body/log')
        .send({ weight_kg: 75.2, notes: 'After workout' });

      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(1);
    });
  });
});
