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
    it('returns current week plan with recipe JOIN fields', async () => {
      mockQuery.mockResolvedValue([
        {
          id: '1',
          week_start: '2026-03-23',
          day_of_week: 1,
          meal_type: 'dinner',
          status: 'planned',
          notes: null,
          servings: 2,
          recipe_name: 'Pasta',
          calories_per_serving: 450,
          prep_time_min: 10,
          cook_time_min: 20,
        },
      ]);

      const res = await request(createApp()).get('/meals/plan');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].recipe_name).toBe('Pasta');
      expect(res.body.data[0].calories_per_serving).toBe(450);
      expect(res.body.week_start).toBe('2026-03-23');
    });

    it('accepts week=next parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/meals/plan?week=next');

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '13' DAY"),
      );
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
      expect(res.body.week_start).toBeNull();
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
    });

    it('accepts skipped status', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/meals/plan/123/status')
        .send({ status: 'skipped' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts ate_out status', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/meals/plan/123/status')
        .send({ status: 'ate_out' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
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
    it('returns recipes without filters', async () => {
      mockQuery.mockResolvedValue([
        { id: '1', name: 'Pasta', calories_per_serving: 450, rating: 4 },
      ]);

      const res = await request(createApp()).get('/meals/recipes');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('filters by search term with parameterized query', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get(
        '/meals/recipes?search=chicken',
      );

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        'chicken',
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

    it('returns 400 for invalid limit', async () => {
      const res = await request(createApp()).get('/meals/recipes?limit=0');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /meals/recipes/:id', () => {
    it('returns full recipe by id', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'r1',
          name: 'Butter Chicken',
          calories_per_serving: 450,
          ingredients: '["chicken", "butter", "tomato"]',
          instructions: 'Cook it all together',
          prep_time_min: 15,
          cook_time_min: 30,
          protein_g: 35,
          carbs_g: 20,
          fat_g: 25,
        },
      ]);

      const res = await request(createApp()).get('/meals/recipes/r1');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('r1');
      expect(res.body.data.name).toBe('Butter Chicken');
      expect(res.body.data.ingredients).toBeDefined();
      expect(res.body.data.instructions).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM lifeos.recipes'),
        'r1',
      );
    });

    it('returns 404 when recipe not found', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/meals/recipes/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Recipe not found');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/meals/recipes/r1');

      expect(res.status).toBe(500);
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
