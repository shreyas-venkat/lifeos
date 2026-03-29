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
    it('returns today vitals', async () => {
      mockQuery.mockResolvedValue([
        { date: '2026-03-29', weight_kg: 75, resting_hr: 60 },
      ]);

      const res = await request(createApp()).get('/health/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].weight_kg).toBe(75);
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

  describe('GET /health/trends', () => {
    it('returns trends with default 30 days', async () => {
      mockQuery.mockResolvedValue([
        { date: '2026-03-01', avg_weight_kg: 75, entries: 1 },
      ]);

      const res = await request(createApp()).get('/health/trends');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(30);
      expect(res.body.data).toHaveLength(1);
    });

    it('accepts custom days parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/health/trends?days=7');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(7);
    });

    it('returns 400 for invalid days', async () => {
      const res = await request(createApp()).get('/health/trends?days=abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('days must be');
    });

    it('returns 400 for days out of range', async () => {
      const res = await request(createApp()).get('/health/trends?days=0');
      expect(res.status).toBe(400);
    });

    it('returns 400 for days exceeding 365', async () => {
      const res = await request(createApp()).get('/health/trends?days=500');
      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const res = await request(createApp()).get('/health/trends?days=7');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Query timeout');
    });
  });
});
