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

import { subscriptionsRouter } from './subscriptions.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/subscriptions', subscriptionsRouter);
  return app;
}

describe('subscriptions routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /subscriptions', () => {
    it('returns active subscriptions ordered by name', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 's1',
          name: 'Netflix',
          merchant_pattern: null,
          amount: 15.99,
          frequency: 'monthly',
          category: 'entertainment',
          active: true,
          last_charged: '2026-03-01',
          created_at: '2026-01-01T10:00:00Z',
        },
        {
          id: 's2',
          name: 'Spotify',
          merchant_pattern: null,
          amount: 11.99,
          frequency: 'monthly',
          category: 'entertainment',
          active: true,
          last_charged: '2026-03-05',
          created_at: '2026-01-15T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/subscriptions');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Netflix');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('active = true'),
      );
    });

    it('returns empty array when no active subscriptions', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/subscriptions');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/subscriptions');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('GET /subscriptions/summary', () => {
    it('returns monthly total cost of active subscriptions', async () => {
      mockQuery.mockResolvedValue([{ monthly_total: 45.97, count: 3 }]);

      const res = await request(createApp()).get('/subscriptions/summary');

      expect(res.status).toBe(200);
      expect(res.body.data.monthly_total).toBe(45.97);
      expect(res.body.data.count).toBe(3);
    });

    it('returns zero when no subscriptions', async () => {
      mockQuery.mockResolvedValue([{ monthly_total: null, count: 0 }]);

      const res = await request(createApp()).get('/subscriptions/summary');

      expect(res.status).toBe(200);
      expect(res.body.data.monthly_total).toBe(0);
      expect(res.body.data.count).toBe(0);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/subscriptions/summary');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /subscriptions', () => {
    it('creates a new subscription', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/subscriptions').send({
        name: 'Netflix',
        amount: 15.99,
        frequency: 'monthly',
        category: 'entertainment',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.name).toBe('Netflix');
      expect(res.body.amount).toBe(15.99);
      expect(res.body.id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.subscriptions'),
        expect.any(String),
        'Netflix',
        null,
        15.99,
        'monthly',
        'entertainment',
      );
    });

    it('defaults frequency to monthly', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/subscriptions').send({
        name: 'Gym',
        amount: 49.99,
      });

      expect(res.status).toBe(200);
      expect(res.body.frequency).toBe('monthly');
    });

    it('returns 400 for missing name', async () => {
      const res = await request(createApp()).post('/subscriptions').send({
        amount: 15.99,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('returns 400 for missing amount', async () => {
      const res = await request(createApp()).post('/subscriptions').send({
        name: 'Netflix',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('amount');
    });

    it('returns 400 for negative amount', async () => {
      const res = await request(createApp()).post('/subscriptions').send({
        name: 'Netflix',
        amount: -5,
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for zero amount', async () => {
      const res = await request(createApp()).post('/subscriptions').send({
        name: 'Netflix',
        amount: 0,
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid frequency', async () => {
      const res = await request(createApp()).post('/subscriptions').send({
        name: 'Netflix',
        amount: 15.99,
        frequency: 'biweekly',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('frequency');
    });

    it('accepts all valid frequencies', async () => {
      const frequencies = ['weekly', 'monthly', 'quarterly', 'annual'];

      for (const frequency of frequencies) {
        mockQuery.mockResolvedValue([]);
        const res = await request(createApp()).post('/subscriptions').send({
          name: 'Test',
          amount: 10,
          frequency,
        });
        expect(res.status).toBe(200);
      }
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/subscriptions').send({
        name: 'Netflix',
        amount: 15.99,
      });

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /subscriptions/:id', () => {
    it('updates subscription fields', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).put('/subscriptions/s1').send({
        name: 'Netflix Premium',
        amount: 22.99,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lifeos.subscriptions SET'),
        'Netflix Premium',
        22.99,
        's1',
      );
    });

    it('updates active status', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).put('/subscriptions/s1').send({
        active: false,
      });

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('active'),
        false,
        's1',
      );
    });

    it('returns 400 for invalid frequency', async () => {
      const res = await request(createApp()).put('/subscriptions/s1').send({
        frequency: 'biweekly',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('frequency');
    });

    it('returns 400 when no fields provided', async () => {
      const res = await request(createApp()).put('/subscriptions/s1').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No fields');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).put('/subscriptions/s1').send({
        amount: 20,
      });

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /subscriptions/:id', () => {
    it('deletes a subscription', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).delete('/subscriptions/s1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM lifeos.subscriptions'),
        's1',
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).delete('/subscriptions/s1');

      expect(res.status).toBe(500);
    });
  });
});
