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

import { usageRouter } from './usage.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/usage', usageRouter);
  return app;
}

describe('usage routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /usage/summary', () => {
    it('returns usage summary for today (default)', async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            total_cost: 0.15,
            total_input_tokens: 5000,
            total_output_tokens: 2000,
            total_requests: 3,
          },
        ])
        .mockResolvedValueOnce([
          {
            task_id: 'lifeos-email-scan',
            cost: 0.1,
            input_tokens: 3000,
            output_tokens: 1200,
            requests: 2,
          },
        ])
        .mockResolvedValueOnce([
          {
            model: 'claude-3-haiku',
            cost: 0.15,
            input_tokens: 5000,
            output_tokens: 2000,
            requests: 3,
          },
        ])
        .mockResolvedValueOnce([
          {
            date: '2026-03-30',
            cost: 0.15,
            input_tokens: 5000,
            output_tokens: 2000,
            requests: 3,
          },
        ]);

      const res = await request(createApp()).get('/usage/summary');

      expect(res.status).toBe(200);
      expect(res.body.data.period).toBe('today');
      expect(res.body.data.totals.total_cost).toBe(0.15);
      expect(res.body.data.totals.total_input_tokens).toBe(5000);
      expect(res.body.data.totals.total_output_tokens).toBe(2000);
      expect(res.body.data.totals.total_requests).toBe(3);
      expect(res.body.data.byTask).toHaveLength(1);
      expect(res.body.data.byTask[0].task_id).toBe('lifeos-email-scan');
      expect(res.body.data.byModel).toHaveLength(1);
      expect(res.body.data.daily).toHaveLength(1);
    });

    it('accepts period=week', async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            total_cost: 1.5,
            total_input_tokens: 50000,
            total_output_tokens: 20000,
            total_requests: 30,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const res = await request(createApp()).get('/usage/summary?period=week');

      expect(res.status).toBe(200);
      expect(res.body.data.period).toBe('week');
      expect(res.body.data.totals.total_cost).toBe(1.5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '7' DAY"),
      );
    });

    it('accepts period=month', async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            total_cost: 5.0,
            total_input_tokens: 200000,
            total_output_tokens: 80000,
            total_requests: 100,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const res = await request(createApp()).get('/usage/summary?period=month');

      expect(res.status).toBe(200);
      expect(res.body.data.period).toBe('month');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '30' DAY"),
      );
    });

    it('returns 400 for invalid period', async () => {
      const res = await request(createApp()).get('/usage/summary?period=year');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('period must be');
    });

    it('returns empty totals when no usage data', async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            total_cost: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_requests: 0,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const res = await request(createApp()).get('/usage/summary');

      expect(res.status).toBe(200);
      expect(res.body.data.totals.total_requests).toBe(0);
      expect(res.body.data.byTask).toEqual([]);
      expect(res.body.data.byModel).toEqual([]);
      expect(res.body.data.daily).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/usage/summary');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });

    it('handles multiple tasks in breakdown', async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            total_cost: 0.3,
            total_input_tokens: 10000,
            total_output_tokens: 4000,
            total_requests: 5,
          },
        ])
        .mockResolvedValueOnce([
          {
            task_id: 'lifeos-email-scan',
            cost: 0.1,
            input_tokens: 3000,
            output_tokens: 1200,
            requests: 2,
          },
          {
            task_id: null,
            cost: 0.2,
            input_tokens: 7000,
            output_tokens: 2800,
            requests: 3,
          },
        ])
        .mockResolvedValueOnce([
          {
            model: 'claude-3-haiku',
            cost: 0.1,
            input_tokens: 3000,
            output_tokens: 1200,
            requests: 2,
          },
          {
            model: 'claude-sonnet-4-20250514',
            cost: 0.2,
            input_tokens: 7000,
            output_tokens: 2800,
            requests: 3,
          },
        ])
        .mockResolvedValueOnce([]);

      const res = await request(createApp()).get('/usage/summary');

      expect(res.status).toBe(200);
      expect(res.body.data.byTask).toHaveLength(2);
      expect(res.body.data.byModel).toHaveLength(2);
    });

    it('uses Mountain Time date for today period', async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            total_cost: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_requests: 0,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const res = await request(createApp()).get('/usage/summary?period=today');

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('America/Edmonton'),
      );
    });
  });
});
