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

import { spendingRouter } from './spending.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/spending', spendingRouter);
  return app;
}

describe('spending routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /spending/summary', () => {
    it('returns spending by category for current month', async () => {
      mockQuery.mockResolvedValue([
        { category: 'groceries', total: 250.5, count: 8 },
        { category: 'dining', total: 120.0, count: 5 },
      ]);

      const res = await request(createApp()).get(
        '/spending/summary?period=month',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].category).toBe('groceries');
      expect(res.body.data[0].total).toBe(250.5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("date_trunc('month', CURRENT_DATE)"),
      );
    });

    it('defaults to month when no period given', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/spending/summary');

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("date_trunc('month', CURRENT_DATE)"),
      );
    });

    it('returns 400 for invalid period', async () => {
      const res = await request(createApp()).get(
        '/spending/summary?period=year',
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('period must be');
    });

    it('returns empty array when no transactions exist', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get(
        '/spending/summary?period=month',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get(
        '/spending/summary?period=month',
      );

      expect(res.status).toBe(500);
    });
  });

  describe('GET /spending/history', () => {
    it('returns monthly spending totals for default 6 months', async () => {
      mockQuery.mockResolvedValue([
        { month: '2026-01-01', total: 1200 },
        { month: '2026-02-01', total: 980 },
        { month: '2026-03-01', total: 1450 },
      ]);

      const res = await request(createApp()).get('/spending/history');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '6' MONTH"),
      );
    });

    it('accepts custom months parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/spending/history?months=3');

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '3' MONTH"),
      );
    });

    it('returns 400 for months out of range', async () => {
      const res = await request(createApp()).get('/spending/history?months=0');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('months must be');
    });

    it('returns 400 for months above 24', async () => {
      const res = await request(createApp()).get('/spending/history?months=25');
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric months', async () => {
      const res = await request(createApp()).get(
        '/spending/history?months=abc',
      );
      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/spending/history');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /spending/recent', () => {
    it('returns last 20 transactions', async () => {
      const txns = Array.from({ length: 3 }, (_, i) => ({
        id: `tx-${i}`,
        amount: 25.99 + i,
        merchant: `Store ${i}`,
        category: 'shopping',
        description: null,
        transaction_date: '2026-03-28',
        source: 'manual',
        created_at: '2026-03-28T12:00:00Z',
      }));
      mockQuery.mockResolvedValue(txns);

      const res = await request(createApp()).get('/spending/recent');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].merchant).toBe('Store 0');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 20'),
      );
    });

    it('returns empty array when no transactions exist', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/spending/recent');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/spending/recent');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /spending/log', () => {
    it('creates a new transaction', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/spending/log').send({
        amount: 45.99,
        merchant: 'Safeway',
        category: 'groceries',
        description: 'Weekly groceries',
        date: '2026-03-28',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.amount).toBe(45.99);
      expect(res.body.merchant).toBe('Safeway');
      expect(res.body.category).toBe('groceries');
      expect(res.body.id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.transactions'),
        expect.any(String),
        45.99,
        'Safeway',
        'groceries',
        'Weekly groceries',
        '2026-03-28',
      );
    });

    it('defaults date to today when not provided', async () => {
      mockQuery.mockResolvedValue([]);
      const today = new Date().toISOString().split('T')[0];

      const res = await request(createApp()).post('/spending/log').send({
        amount: 12.5,
        merchant: 'Coffee Shop',
        category: 'dining',
      });

      expect(res.status).toBe(200);
      expect(res.body.transaction_date).toBe(today);
    });

    it('allows null description', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/spending/log').send({
        amount: 30,
        merchant: 'Gas Station',
        category: 'transport',
      });

      expect(res.status).toBe(200);
      expect(res.body.description).toBeNull();
    });

    it('returns 400 for missing amount', async () => {
      const res = await request(createApp()).post('/spending/log').send({
        merchant: 'Store',
        category: 'shopping',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('amount');
    });

    it('returns 400 for negative amount', async () => {
      const res = await request(createApp()).post('/spending/log').send({
        amount: -10,
        merchant: 'Store',
        category: 'shopping',
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for zero amount', async () => {
      const res = await request(createApp()).post('/spending/log').send({
        amount: 0,
        merchant: 'Store',
        category: 'shopping',
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing merchant', async () => {
      const res = await request(createApp()).post('/spending/log').send({
        amount: 25,
        category: 'shopping',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('merchant');
    });

    it('returns 400 for invalid category', async () => {
      const res = await request(createApp()).post('/spending/log').send({
        amount: 25,
        merchant: 'Store',
        category: 'invalid',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('category');
    });

    it('returns 400 for missing category', async () => {
      const res = await request(createApp()).post('/spending/log').send({
        amount: 25,
        merchant: 'Store',
      });

      expect(res.status).toBe(400);
    });

    it('accepts all valid categories', async () => {
      const categories = [
        'groceries',
        'dining',
        'transport',
        'entertainment',
        'bills',
        'health',
        'shopping',
        'other',
      ];

      for (const category of categories) {
        mockQuery.mockResolvedValue([]);
        const res = await request(createApp()).post('/spending/log').send({
          amount: 10,
          merchant: 'Test',
          category,
        });
        expect(res.status).toBe(200);
      }
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/spending/log').send({
        amount: 25,
        merchant: 'Store',
        category: 'shopping',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /spending/:id', () => {
    it('deletes a transaction', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).delete('/spending/tx-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM lifeos.transactions'),
        'tx-123',
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).delete('/spending/tx-123');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /spending/forecast', () => {
    it('returns spending forecast with projections', async () => {
      mockQuery
        // current month total
        .mockResolvedValueOnce([{ total: 847.5 }])
        // days elapsed + days in month
        .mockResolvedValueOnce([{ days_elapsed: 15, days_in_month: 30 }])
        // last month total
        .mockResolvedValueOnce([{ total: 1420.0 }])
        // by-category breakdown
        .mockResolvedValueOnce([
          { category: 'food', total: 340.0 },
          { category: 'transport', total: 200.0 },
        ]);

      const res = await request(createApp()).get('/spending/forecast');

      expect(res.status).toBe(200);
      expect(res.body.data.current_month_total).toBe(847.5);
      expect(res.body.data.days_elapsed).toBe(15);
      expect(res.body.data.daily_average).toBe(56.5);
      expect(res.body.data.projected_total).toBe(1695.0);
      expect(res.body.data.last_month_total).toBe(1420.0);
      expect(res.body.data.change_pct).toBe(19.4);
      expect(res.body.data.by_category).toHaveLength(2);
      expect(res.body.data.by_category[0].category).toBe('food');
      expect(res.body.data.by_category[0].total).toBe(340.0);
      expect(res.body.data.by_category[0].projected).toBe(680.0);
    });

    it('handles zero spending gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ days_elapsed: 10, days_in_month: 31 }])
        .mockResolvedValueOnce([{ total: 500 }])
        .mockResolvedValueOnce([]);

      const res = await request(createApp()).get('/spending/forecast');

      expect(res.status).toBe(200);
      expect(res.body.data.current_month_total).toBe(0);
      expect(res.body.data.daily_average).toBe(0);
      expect(res.body.data.projected_total).toBe(0);
      expect(res.body.data.change_pct).toBe(-100);
      expect(res.body.data.by_category).toEqual([]);
    });

    it('handles zero last month total (no division by zero)', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: 200 }])
        .mockResolvedValueOnce([{ days_elapsed: 5, days_in_month: 30 }])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ category: 'groceries', total: 200 }]);

      const res = await request(createApp()).get('/spending/forecast');

      expect(res.status).toBe(200);
      expect(res.body.data.change_pct).toBe(0);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/spending/forecast');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /spending/budget', () => {
    it('returns budget with spending data', async () => {
      mockQuery
        .mockResolvedValueOnce([{ value: '2000' }])
        .mockResolvedValueOnce([{ total: 850 }]);

      const res = await request(createApp()).get('/spending/budget');

      expect(res.status).toBe(200);
      expect(res.body.data.budget).toBe(2000);
      expect(res.body.data.spent).toBe(850);
      expect(res.body.data.remaining).toBe(1150);
      expect(res.body.data.percent_used).toBe(43);
    });

    it('returns null when no budget preference set', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/spending/budget');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('returns null for non-numeric budget preference', async () => {
      mockQuery.mockResolvedValue([{ value: 'not-a-number' }]);

      const res = await request(createApp()).get('/spending/budget');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/spending/budget');

      expect(res.status).toBe(500);
    });
  });
});
