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

import { supplementsRouter } from './supplements.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/supplements', supplementsRouter);
  return app;
}

describe('supplements routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /supplements/today', () => {
    it('returns today supplements', async () => {
      mockQuery.mockResolvedValue([
        {
          id: '1',
          name: 'Vitamin D',
          dosage: '5000 IU',
          taken: false,
          time_of_day: 'morning',
        },
      ]);

      const res = await request(createApp()).get('/supplements/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Vitamin D');
    });

    it('returns empty array when no supplements today', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/supplements/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/supplements/today');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /supplements/:id/taken', () => {
    it('marks supplement as taken with default timestamp', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/supplements/abc/taken')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe('abc');
      expect(res.body.taken_at).toBeDefined();
    });

    it('marks supplement as taken with custom timestamp', async () => {
      mockQuery.mockResolvedValue([]);
      const timestamp = '2026-03-29T10:00:00Z';

      const res = await request(createApp())
        .post('/supplements/abc/taken')
        .send({ taken_at: timestamp });

      expect(res.status).toBe(200);
      expect(res.body.taken_at).toBe(timestamp);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp())
        .post('/supplements/abc/taken')
        .send({});

      expect(res.status).toBe(500);
    });
  });
});
