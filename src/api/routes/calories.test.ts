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

import { caloriesRouter } from './calories.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/calories', caloriesRouter);
  return app;
}

describe('calories routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /calories/today', () => {
    it('returns today calorie entries with total', async () => {
      mockQuery.mockResolvedValue([
        {
          id: '1',
          meal_type: 'breakfast',
          calories: 400,
          description: 'Oatmeal',
        },
        { id: '2', meal_type: 'lunch', calories: 600, description: 'Salad' },
      ]);

      const res = await request(createApp()).get('/calories/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total_calories).toBe(1000);
    });

    it('returns zero total when no entries', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/calories/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total_calories).toBe(0);
    });

    it('handles entries without calorie values', async () => {
      mockQuery.mockResolvedValue([
        { id: '1', meal_type: 'snack', description: 'Apple' },
      ]);

      const res = await request(createApp()).get('/calories/today');

      expect(res.status).toBe(200);
      expect(res.body.total_calories).toBe(0);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/calories/today');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /calories/week', () => {
    it('returns weekly calorie summary', async () => {
      mockQuery.mockResolvedValue([
        { date: '2026-03-23', total_calories: 2000, entries: 3 },
        { date: '2026-03-24', total_calories: 1800, entries: 3 },
      ]);

      const res = await request(createApp()).get('/calories/week');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.week_total_calories).toBe(3800);
    });

    it('returns zero total for empty week', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/calories/week');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.week_total_calories).toBe(0);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/calories/week');

      expect(res.status).toBe(500);
    });
  });
});
