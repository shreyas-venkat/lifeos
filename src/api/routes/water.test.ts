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

import { waterRouter } from './water.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/water', waterRouter);
  return app;
}

describe('water routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /water/today', () => {
    it('returns today glass count', async () => {
      mockQuery.mockResolvedValue([{ glasses: 5 }]);

      const res = await request(createApp()).get('/water/today');

      expect(res.status).toBe(200);
      expect(res.body.data.glasses).toBe(5);
    });

    it('returns 0 glasses when no entry for today', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/water/today');

      expect(res.status).toBe(200);
      expect(res.body.data.glasses).toBe(0);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/water/today');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('POST /water/log', () => {
    it('increments existing entry for today', async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 'w1', glasses: 3 }])
        .mockResolvedValueOnce([]);

      const res = await request(createApp()).post('/water/log');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.glasses).toBe(4);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE lifeos.water_log'),
        4,
        'w1',
      );
    });

    it('creates new entry when none exists for today', async () => {
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const res = await request(createApp()).post('/water/log');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.glasses).toBe(1);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO lifeos.water_log'),
        expect.any(String),
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/water/log');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });
});
