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
    it('returns today calorie entries with macro totals', async () => {
      mockQuery.mockResolvedValue([
        {
          id: '1',
          meal_type: 'breakfast',
          calories: 400,
          protein_g: 20,
          carbs_g: 50,
          fat_g: 15,
          description: 'Oatmeal',
        },
        {
          id: '2',
          meal_type: 'lunch',
          calories: 600,
          protein_g: 35,
          carbs_g: 60,
          fat_g: 20,
          description: 'Salad',
        },
      ]);

      const res = await request(createApp()).get('/calories/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total.calories).toBe(1000);
      expect(res.body.total.protein_g).toBe(55);
      expect(res.body.total.carbs_g).toBe(110);
      expect(res.body.total.fat_g).toBe(35);
    });

    it('returns zero totals when no entries', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/calories/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total.calories).toBe(0);
      expect(res.body.total.protein_g).toBe(0);
    });

    it('handles entries without calorie values', async () => {
      mockQuery.mockResolvedValue([
        { id: '1', meal_type: 'snack', description: 'Apple' },
      ]);

      const res = await request(createApp()).get('/calories/today');

      expect(res.status).toBe(200);
      expect(res.body.total.calories).toBe(0);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/calories/today');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /calories/history', () => {
    it('returns history with default 7 days', async () => {
      mockQuery.mockResolvedValue([
        {
          log_date: '2026-03-23',
          calories: 2000,
          protein_g: 100,
          carbs_g: 250,
          fat_g: 70,
          entries: 3,
        },
        {
          log_date: '2026-03-24',
          calories: 1800,
          protein_g: 90,
          carbs_g: 220,
          fat_g: 65,
          entries: 3,
        },
      ]);

      const res = await request(createApp()).get('/calories/history');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(7);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].log_date).toBe('2026-03-23');
    });

    it('accepts custom days parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/calories/history?days=30');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(30);
    });

    it('returns 400 for invalid days', async () => {
      const res = await request(createApp()).get('/calories/history?days=abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('days must be');
    });

    it('returns 400 for days out of range', async () => {
      const res = await request(createApp()).get('/calories/history?days=0');
      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/calories/history?days=7');

      expect(res.status).toBe(500);
    });
  });
});
