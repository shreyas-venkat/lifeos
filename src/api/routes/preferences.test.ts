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

import { preferencesRouter } from './preferences.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/preferences', preferencesRouter);
  return app;
}

describe('preferences routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /preferences', () => {
    it('returns all preferences ordered by skill and key', async () => {
      mockQuery.mockResolvedValue([
        {
          key: 'dietary_restrictions',
          value: 'vegetarian',
          skill: 'meals',
          updated_at: '2026-03-29T10:00:00Z',
        },
        {
          key: 'timezone',
          value: 'America/Edmonton',
          skill: 'general',
          updated_at: '2026-03-29T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/preferences');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY skill, key'),
      );
    });

    it('returns empty array when no preferences', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/preferences');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/preferences');

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /preferences', () => {
    it('upserts preferences with skill column', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .put('/preferences')
        .send({
          preferences: [
            { key: 'timezone', value: 'America/Edmonton', skill: 'general' },
            { key: 'theme', value: 'dark' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.updated).toBe(2);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (key, skill)'),
        'timezone',
        'America/Edmonton',
        'general',
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (key, skill)'),
        'theme',
        'dark',
        'general',
      );
    });

    it('returns 400 when preferences is missing', async () => {
      const res = await request(createApp()).put('/preferences').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('preferences is required');
    });

    it('returns 400 when preferences is not an array', async () => {
      const res = await request(createApp())
        .put('/preferences')
        .send({ preferences: 'not-array' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when preference key is missing', async () => {
      const res = await request(createApp())
        .put('/preferences')
        .send({ preferences: [{ value: 'test' }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('key');
    });

    it('returns 400 when preference value is missing', async () => {
      const res = await request(createApp())
        .put('/preferences')
        .send({ preferences: [{ key: 'test' }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('value');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp())
        .put('/preferences')
        .send({ preferences: [{ key: 'test', value: 'val' }] });

      expect(res.status).toBe(500);
    });
  });
});
