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

import { billsRouter } from './bills.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/bills', billsRouter);
  return app;
}

describe('bills routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /bills', () => {
    it('returns all bills ordered by due_date', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'b1',
          name: 'Internet',
          amount: 75.0,
          merchant: 'Telus',
          due_date: '2026-04-01',
          recurring: 'monthly',
          status: 'upcoming',
          created_at: '2026-03-01T10:00:00Z',
        },
        {
          id: 'b2',
          name: 'Electricity',
          amount: 120.0,
          merchant: 'Enmax',
          due_date: '2026-04-15',
          recurring: 'monthly',
          status: 'upcoming',
          created_at: '2026-03-01T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/bills');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Internet');
      expect(res.body.data[1].name).toBe('Electricity');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY due_date ASC'),
      );
    });

    it('returns empty array when no bills', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/bills');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/bills');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('GET /bills/summary', () => {
    it('returns bills grouped by recurring status', async () => {
      mockQuery.mockResolvedValue([
        { recurring: 'monthly', total: 195.0, count: 2 },
        { recurring: 'annual', total: 500.0, count: 1 },
      ]);

      const res = await request(createApp()).get('/bills/summary');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].recurring).toBe('monthly');
      expect(res.body.data[0].total).toBe(195.0);
      expect(res.body.data[0].count).toBe(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY recurring'),
      );
    });

    it('returns empty array when no bills', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/bills/summary');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/bills/summary');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });
});
