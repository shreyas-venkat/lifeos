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
    it('returns today supplements with JOIN data', async () => {
      mockQuery.mockResolvedValue([
        {
          supplement_id: 's1',
          name: 'Vitamin D',
          default_dosage: 5000,
          unit: 'IU',
          time_of_day: 'morning',
          log_id: null,
          recommended_dosage: null,
          reason: null,
          taken: null,
          log_date: null,
        },
      ]);

      const res = await request(createApp()).get('/supplements/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Vitamin D');
      expect(res.body.data[0].supplement_id).toBe('s1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN lifeos.supplement_log'),
      );
    });

    it('returns empty array when no active supplements', async () => {
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
    it('inserts a supplement log entry with parameterized query', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/supplements/abc/taken')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.supplement_log'),
        expect.any(String),
        'abc',
        'morning',
      );
    });

    it('accepts custom time_of_day', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/supplements/abc/taken')
        .send({ time_of_day: 'evening' });

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.supplement_log'),
        expect.any(String),
        'abc',
        'evening',
      );
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
