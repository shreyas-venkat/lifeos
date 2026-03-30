import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../db.js', () => ({
  query: mockQuery,
  getDb: vi.fn(),
}));

import { pantrySmartRouter } from './pantry-smart.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/pantry/smart', pantrySmartRouter);
  return app;
}

const now = new Date('2026-03-29T12:00:00Z');

describe('pantry-smart routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    vi.useFakeTimers({ now });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('GET /pantry/smart/alerts', () => {
    it('returns expiring, depleted, and stale items', async () => {
      // Single query returns all pantry items; the route filters them
      mockQuery.mockResolvedValue([
        {
          id: '1',
          item: 'Milk',
          quantity: 2,
          unit: 'L',
          category: 'dairy',
          expiry_date: '2026-03-31',
          updated_at: '2026-03-28T10:00:00Z',
        },
        {
          id: '2',
          item: 'Salt',
          quantity: 0,
          unit: 'kg',
          category: 'spices',
          expiry_date: null,
          updated_at: '2026-03-20T10:00:00Z',
        },
        {
          id: '3',
          item: 'Flour',
          quantity: 1,
          unit: 'kg',
          category: 'grains',
          expiry_date: '2026-06-01',
          updated_at: '2026-02-01T10:00:00Z',
        },
        {
          id: '4',
          item: 'Rice',
          quantity: 5,
          unit: 'kg',
          category: 'grains',
          expiry_date: '2026-12-01',
          updated_at: '2026-03-28T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/pantry/smart/alerts');

      expect(res.status).toBe(200);
      // Milk expires within 3 days (March 31 - March 29 = 2 days)
      expect(res.body.data.expiring).toHaveLength(1);
      expect(res.body.data.expiring[0].item).toBe('Milk');
      // Salt has quantity 0
      expect(res.body.data.depleted).toHaveLength(1);
      expect(res.body.data.depleted[0].item).toBe('Salt');
      // Flour updated_at is 2026-02-01, that's 56 days ago (>30)
      expect(res.body.data.stale).toHaveLength(1);
      expect(res.body.data.stale[0].item).toBe('Flour');
    });

    it('returns empty arrays when no alerts exist', async () => {
      mockQuery.mockResolvedValue([
        {
          id: '1',
          item: 'Rice',
          quantity: 5,
          unit: 'kg',
          category: 'grains',
          expiry_date: '2026-12-01',
          updated_at: '2026-03-28T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/pantry/smart/alerts');

      expect(res.status).toBe(200);
      expect(res.body.data.expiring).toEqual([]);
      expect(res.body.data.depleted).toEqual([]);
      expect(res.body.data.stale).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/pantry/smart/alerts');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('GET /pantry/smart/suggestions', () => {
    it('returns top 5 recipes sorted by match percentage', async () => {
      // First call: pantry items
      mockQuery.mockResolvedValueOnce([
        {
          id: '1',
          item: 'Chicken',
          quantity: 1,
          unit: 'kg',
          category: 'protein',
          expiry_date: null,
          updated_at: '2026-03-28T10:00:00Z',
        },
        {
          id: '2',
          item: 'Rice',
          quantity: 2,
          unit: 'kg',
          category: 'grains',
          expiry_date: null,
          updated_at: '2026-03-28T10:00:00Z',
        },
        {
          id: '3',
          item: 'Soy Sauce',
          quantity: 1,
          unit: 'bottle',
          category: 'condiments',
          expiry_date: null,
          updated_at: '2026-03-28T10:00:00Z',
        },
      ]);
      // Second call: recipes
      mockQuery.mockResolvedValueOnce([
        {
          id: 'r1',
          name: 'Chicken Fried Rice',
          calories_per_serving: 450,
          rating: 4,
          times_cooked: 3,
          prep_time_min: 10,
          cook_time_min: 20,
          servings: 2,
          tags: ['asian'],
          ingredients: '["chicken breast", "rice", "soy sauce", "garlic"]',
        },
        {
          id: 'r2',
          name: 'Beef Stew',
          calories_per_serving: 550,
          rating: 5,
          times_cooked: 1,
          prep_time_min: 15,
          cook_time_min: 60,
          servings: 4,
          tags: ['comfort'],
          ingredients: '["beef", "potatoes", "carrots", "onion"]',
        },
        {
          id: 'r3',
          name: 'Chicken Salad',
          calories_per_serving: 300,
          rating: 3,
          times_cooked: 2,
          prep_time_min: 5,
          cook_time_min: 0,
          servings: 1,
          tags: ['light'],
          ingredients: '["chicken", "lettuce", "tomato"]',
        },
      ]);

      const res = await request(createApp()).get('/pantry/smart/suggestions');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.length).toBeLessThanOrEqual(5);

      // Chicken Fried Rice should be first (3/4 ingredients match = 75%)
      expect(res.body.data[0].recipe.name).toBe('Chicken Fried Rice');
      expect(res.body.data[0].match_pct).toBe(75);
      expect(res.body.data[0].missing).toEqual(['garlic']);

      // Chicken Salad should be second (1/3 match = 33%)
      expect(res.body.data[1].recipe.name).toBe('Chicken Salad');
      expect(res.body.data[1].match_pct).toBe(33);
    });

    it('filters out recipes with 0% match', async () => {
      mockQuery.mockResolvedValueOnce([
        {
          id: '1',
          item: 'Tofu',
          quantity: 1,
          unit: 'block',
          category: 'protein',
          expiry_date: null,
          updated_at: '2026-03-28T10:00:00Z',
        },
      ]);
      mockQuery.mockResolvedValueOnce([
        {
          id: 'r1',
          name: 'Beef Stew',
          calories_per_serving: 550,
          rating: 5,
          times_cooked: 1,
          prep_time_min: 15,
          cook_time_min: 60,
          servings: 4,
          tags: ['comfort'],
          ingredients: '["beef", "potatoes", "carrots"]',
        },
      ]);

      const res = await request(createApp()).get('/pantry/smart/suggestions');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('handles recipes with empty or null ingredients', async () => {
      mockQuery.mockResolvedValueOnce([
        {
          id: '1',
          item: 'Chicken',
          quantity: 1,
          unit: 'kg',
          category: 'protein',
          expiry_date: null,
          updated_at: '2026-03-28T10:00:00Z',
        },
      ]);
      mockQuery.mockResolvedValueOnce([
        {
          id: 'r1',
          name: 'Mystery Dish',
          calories_per_serving: 300,
          rating: 3,
          times_cooked: 0,
          prep_time_min: 5,
          cook_time_min: 10,
          servings: 1,
          tags: null,
          ingredients: null,
        },
        {
          id: 'r2',
          name: 'Empty Recipe',
          calories_per_serving: 200,
          rating: 2,
          times_cooked: 0,
          prep_time_min: 5,
          cook_time_min: 5,
          servings: 1,
          tags: null,
          ingredients: '[]',
        },
      ]);

      const res = await request(createApp()).get('/pantry/smart/suggestions');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/pantry/smart/suggestions');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('GET /pantry/smart/shopping-needs', () => {
    it('returns ingredients needed but not in pantry', async () => {
      // First call: this week's meal plan with recipe IDs
      mockQuery.mockResolvedValueOnce([
        { recipe_id: 'r1' },
        { recipe_id: 'r2' },
        { recipe_id: null },
      ]);
      // Second call: recipes for the recipe IDs
      mockQuery.mockResolvedValueOnce([
        {
          id: 'r1',
          name: 'Chicken Fried Rice',
          ingredients: '["chicken breast", "rice", "soy sauce", "garlic"]',
        },
        {
          id: 'r2',
          name: 'Beef Stew',
          ingredients: '["beef", "potatoes", "carrots", "onion"]',
        },
      ]);
      // Third call: pantry items
      mockQuery.mockResolvedValueOnce([
        {
          id: '1',
          item: 'Chicken',
          quantity: 1,
          unit: 'kg',
          category: 'protein',
          expiry_date: null,
          updated_at: '2026-03-28T10:00:00Z',
        },
        {
          id: '2',
          item: 'Rice',
          quantity: 2,
          unit: 'kg',
          category: 'grains',
          expiry_date: null,
          updated_at: '2026-03-28T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get(
        '/pantry/smart/shopping-needs',
      );

      expect(res.status).toBe(200);
      // chicken breast matches "Chicken" in pantry, rice matches "Rice"
      // Missing: soy sauce, garlic, beef, potatoes, carrots, onion
      expect(res.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ingredient: 'soy sauce' }),
          expect.objectContaining({ ingredient: 'garlic' }),
          expect.objectContaining({ ingredient: 'beef' }),
          expect.objectContaining({ ingredient: 'potatoes' }),
          expect.objectContaining({ ingredient: 'carrots' }),
          expect.objectContaining({ ingredient: 'onion' }),
        ]),
      );
      // Should NOT include chicken or rice
      const ingredientNames = res.body.data.map(
        (d: { ingredient: string }) => d.ingredient,
      );
      expect(ingredientNames).not.toContain('chicken breast');
      expect(ingredientNames).not.toContain('rice');
    });

    it('returns empty array when no meal plan exists', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const res = await request(createApp()).get(
        '/pantry/smart/shopping-needs',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array when all ingredients are in pantry', async () => {
      mockQuery.mockResolvedValueOnce([{ recipe_id: 'r1' }]);
      mockQuery.mockResolvedValueOnce([
        {
          id: 'r1',
          name: 'Simple Rice',
          ingredients: '["rice"]',
        },
      ]);
      mockQuery.mockResolvedValueOnce([
        {
          id: '1',
          item: 'Rice',
          quantity: 5,
          unit: 'kg',
          category: 'grains',
          expiry_date: null,
          updated_at: '2026-03-28T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get(
        '/pantry/smart/shopping-needs',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get(
        '/pantry/smart/shopping-needs',
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });
});
