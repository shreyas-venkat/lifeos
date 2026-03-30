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

import { photoEstimateRouter } from './photo-estimate.js';

function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/calories', photoEstimateRouter);
  return app;
}

describe('photo-estimate routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('POST /calories/photo-log', () => {
    it('logs a calorie entry with photo reference', async () => {
      mockQuery.mockResolvedValue([]);
      const fakeImage = Buffer.from('fake-image-data').toString('base64');

      const res = await request(createApp()).post('/calories/photo-log').send({
        image: fakeImage,
        description: 'Grilled chicken salad',
        meal_type: 'lunch',
        calories: 450,
        protein_g: 35,
        carbs_g: 20,
        fat_g: 15,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(res.body.source).toBe('photo');
      expect(res.body.image_size).toBeGreaterThan(0);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.calorie_log'),
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'photo'"),
      );
    });

    it('logs without a photo (manual source)', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/calories/photo-log').send({
        description: 'Apple and peanut butter',
        meal_type: 'snack',
        calories: 250,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.source).toBe('manual');
      expect(res.body.image_size).toBe(0);
    });

    it('returns 400 when description is missing', async () => {
      const res = await request(createApp()).post('/calories/photo-log').send({
        meal_type: 'lunch',
        calories: 500,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('description is required');
    });

    it('returns 400 when meal_type is missing', async () => {
      const res = await request(createApp()).post('/calories/photo-log').send({
        description: 'Sandwich',
        calories: 500,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('meal_type is required');
    });

    it('returns 400 when calories is missing', async () => {
      const res = await request(createApp()).post('/calories/photo-log').send({
        description: 'Sandwich',
        meal_type: 'lunch',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('calories is required');
    });

    it('returns 400 for negative calories', async () => {
      const res = await request(createApp()).post('/calories/photo-log').send({
        description: 'Sandwich',
        meal_type: 'lunch',
        calories: -100,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-negative');
    });

    it('returns 400 when image is not a string', async () => {
      const res = await request(createApp()).post('/calories/photo-log').send({
        image: 12345,
        description: 'Sandwich',
        meal_type: 'lunch',
        calories: 500,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('base64 string');
    });

    it('returns 413 when image exceeds 5MB', async () => {
      // Create a base64 string that decodes to >5MB
      // 5MB = 5242880 bytes; base64 encodes 3 bytes as 4 chars
      // So we need > 5242880 * 4/3 = ~6990507 chars
      const oversizedImage = 'A'.repeat(7_000_000);

      const res = await request(createApp()).post('/calories/photo-log').send({
        image: oversizedImage,
        description: 'Huge photo',
        meal_type: 'dinner',
        calories: 800,
      });

      expect(res.status).toBe(413);
      expect(res.body.error).toContain('5MB');
    });

    it('handles optional macro fields as NULL', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/calories/photo-log').send({
        description: 'Rice bowl',
        meal_type: 'dinner',
        calories: 600,
      });

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('NULL'));
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB connection failed'));

      const res = await request(createApp()).post('/calories/photo-log').send({
        description: 'Pasta',
        meal_type: 'dinner',
        calories: 700,
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB connection failed');
    });
  });
});
