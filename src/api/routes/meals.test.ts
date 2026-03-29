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

import { mealsRouter } from './meals.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/meals', mealsRouter);
  return app;
}

describe('meals routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /meals/plan', () => {
    it('returns current week plan by default', async () => {
      mockQuery.mockResolvedValue([
        {
          id: '1',
          recipe_name: 'Pasta',
          day_of_week: 1,
          meal_type: 'dinner',
        },
      ]);

      const res = await request(createApp()).get('/meals/plan');

      expect(res.status).toBe(200);
      expect(res.body.week).toBe('current');
      expect(res.body.data).toHaveLength(1);
    });

    it('accepts week=next parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/meals/plan?week=next');

      expect(res.status).toBe(200);
      expect(res.body.week).toBe('next');
    });

    it('returns 400 for invalid week value', async () => {
      const res = await request(createApp()).get('/meals/plan?week=invalid');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('week must be');
    });

    it('returns empty array when no plans exist', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/meals/plan?week=current');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/meals/plan');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /meals/plan/:id/status', () => {
    it('updates meal status to cooked', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/meals/plan/123/status')
        .send({ status: 'cooked' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('cooked');
    });

    it('accepts skipped status', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/meals/plan/123/status')
        .send({ status: 'skipped' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('skipped');
    });

    it('accepts ate_out status', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/meals/plan/123/status')
        .send({ status: 'ate_out' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ate_out');
    });

    it('returns 400 for missing status', async () => {
      const res = await request(createApp())
        .post('/meals/plan/123/status')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid status', async () => {
      const res = await request(createApp())
        .post('/meals/plan/123/status')
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp())
        .post('/meals/plan/123/status')
        .send({ status: 'cooked' });

      expect(res.status).toBe(500);
    });
  });

  describe('GET /meals/recipes', () => {
    it('returns all recipes without filters', async () => {
      mockQuery.mockResolvedValue([
        { id: '1', name: 'Pasta', cuisine: 'Italian' },
      ]);

      const res = await request(createApp()).get('/meals/recipes');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('filters by search term', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get(
        '/meals/recipes?search=chicken',
      );

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        '%chicken%',
      );
    });

    it('filters by cuisine', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get(
        '/meals/recipes?cuisine=Italian',
      );

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('cuisine'),
        'Italian',
      );
    });

    it('returns empty array when no recipes match', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get(
        '/meals/recipes?search=nonexistent',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /meals/recipes/:id/rate', () => {
    it('rates a recipe', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/meals/recipes/456/rate')
        .send({ rating: 4 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.rating).toBe(4);
    });

    it('returns 400 for missing rating', async () => {
      const res = await request(createApp())
        .post('/meals/recipes/456/rate')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric rating', async () => {
      const res = await request(createApp())
        .post('/meals/recipes/456/rate')
        .send({ rating: 'good' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for rating below 1', async () => {
      const res = await request(createApp())
        .post('/meals/recipes/456/rate')
        .send({ rating: 0 });

      expect(res.status).toBe(400);
    });

    it('returns 400 for rating above 5', async () => {
      const res = await request(createApp())
        .post('/meals/recipes/456/rate')
        .send({ rating: 6 });

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp())
        .post('/meals/recipes/456/rate')
        .send({ rating: 3 });

      expect(res.status).toBe(500);
    });
  });
});
