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

import { healthRouter } from './health.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/health', healthRouter);
  return app;
}

describe('health routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /health/today', () => {
    it('returns today metrics with correct columns', async () => {
      mockQuery.mockResolvedValue([
        {
          metric_type: 'steps',
          value: 7200,
          unit: null,
          recorded_at: '2026-03-29T10:00:00Z',
        },
        {
          metric_type: 'heart_rate',
          value: 72,
          unit: 'bpm',
          recorded_at: '2026-03-29T09:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/health/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].metric_type).toBe('steps');
      expect(res.body.data[0].value).toBe(7200);
    });

    it('returns empty array when no data', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/health/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB connection failed'));

      const res = await request(createApp()).get('/health/today');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB connection failed');
    });
  });

  describe('GET /health/history', () => {
    it('returns history with default 7 days', async () => {
      mockQuery.mockResolvedValue([
        {
          date: '2026-03-28',
          metric_type: 'steps',
          avg_value: 8000,
          min_value: 5000,
          max_value: 12000,
          readings: 3,
        },
      ]);

      const res = await request(createApp()).get('/health/history');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(7);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].avg_value).toBe(8000);
    });

    it('accepts custom days parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/health/history?days=30');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(30);
    });

    it('filters by metric type', async () => {
      mockQuery.mockResolvedValue([
        {
          date: '2026-03-28',
          metric_type: 'steps',
          avg_value: 8000,
          min_value: 5000,
          max_value: 12000,
          readings: 3,
        },
      ]);

      const res = await request(createApp()).get(
        '/health/history?days=7&metric=steps',
      );

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('metric_type = $1'),
        'steps',
      );
    });

    it('returns 400 for invalid days', async () => {
      const res = await request(createApp()).get('/health/history?days=abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('days must be');
    });

    it('returns 400 for days out of range', async () => {
      const res = await request(createApp()).get('/health/history?days=0');
      expect(res.status).toBe(400);
    });

    it('returns 400 for days exceeding 365', async () => {
      const res = await request(createApp()).get('/health/history?days=500');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid metric', async () => {
      const res = await request(createApp()).get(
        '/health/history?metric=invalid',
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('metric must be one of');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const res = await request(createApp()).get('/health/history?days=7');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Query timeout');
    });
  });
});
