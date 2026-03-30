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

import { pantryRouter } from './pantry.js';

function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/pantry', pantryRouter);
  return app;
}

describe('pantry routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /pantry', () => {
    it('returns current inventory with correct columns', async () => {
      mockQuery.mockResolvedValue([
        {
          id: '1',
          item: 'Rice',
          category: 'grains',
          quantity: 2,
          unit: 'kg',
          expiry_date: '2026-06-01',
          updated_at: '2026-03-29T10:00:00Z',
        },
        {
          id: '2',
          item: 'Chicken',
          category: 'protein',
          quantity: 1,
          unit: 'kg',
          expiry_date: null,
          updated_at: '2026-03-29T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/pantry');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].item).toBe('Rice');
      expect(res.body.data[0].expiry_date).toBe('2026-06-01');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('item'));
    });

    it('returns empty array when pantry is empty', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/pantry');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/pantry');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('POST /pantry', () => {
    it('inserts a new pantry item and returns id', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/pantry').send({
        item: 'Eggs',
        quantity: 12,
        unit: 'pcs',
        category: 'protein',
        expiry_date: '2026-04-15',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.pantry'),
        expect.any(String),
        'Eggs',
        12,
        'pcs',
        'protein',
        '2026-04-15',
      );
    });

    it('inserts item without expiry_date (NULL)', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/pantry').send({
        item: 'Salt',
        quantity: 1,
        unit: 'kg',
        category: 'spices',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.pantry'),
        expect.any(String),
        'Salt',
        1,
        'kg',
        'spices',
        null,
      );
    });

    it('returns 400 when item is missing', async () => {
      const res = await request(createApp()).post('/pantry').send({
        quantity: 1,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('item is required');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/pantry').send({
        item: 'Eggs',
        quantity: 12,
        unit: 'pcs',
        category: 'protein',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /pantry/:id', () => {
    it('deletes a pantry item by id', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).delete('/pantry/abc-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM lifeos.pantry'),
        'abc-123',
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).delete('/pantry/abc-123');

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /pantry/:id', () => {
    it('updates quantity and unit', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .put('/pantry/abc-123')
        .send({ quantity: 5, unit: 'lbs' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lifeos.pantry'),
        5,
        'lbs',
        'abc-123',
      );
    });

    it('returns 400 when no fields provided', async () => {
      const res = await request(createApp()).put('/pantry/abc-123').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No fields to update');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp())
        .put('/pantry/abc-123')
        .send({ quantity: 5 });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /pantry/photo', () => {
    it('accepts a base64 image', async () => {
      const res = await request(createApp())
        .post('/pantry/photo')
        .send({ image: 'aGVsbG8gd29ybGQ=' });

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('accepted');
      expect(res.body.image_size).toBe('aGVsbG8gd29ybGQ='.length);
    });

    it('returns 400 when image is missing', async () => {
      const res = await request(createApp()).post('/pantry/photo').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('image is required');
    });

    it('returns 400 when image is not a string', async () => {
      const res = await request(createApp())
        .post('/pantry/photo')
        .send({ image: 12345 });

      expect(res.status).toBe(400);
    });

    it('returns 400 when image exceeds size limit', async () => {
      const largeImage = 'x'.repeat(10_000_001);

      const res = await request(createApp())
        .post('/pantry/photo')
        .send({ image: largeImage });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('maximum size');
    });
  });
});
