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
    it('returns current inventory', async () => {
      mockQuery.mockResolvedValue([
        { id: '1', name: 'Rice', category: 'grains', quantity: 2 },
        { id: '2', name: 'Chicken', category: 'protein', quantity: 1 },
      ]);

      const res = await request(createApp()).get('/pantry');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
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
