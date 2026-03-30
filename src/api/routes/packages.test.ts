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

import { packagesRouter } from './packages.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/packages', packagesRouter);
  return app;
}

describe('packages routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /packages', () => {
    it('returns active packages ordered by expected_delivery', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'p1',
          merchant: 'Amazon',
          tracking_number: '1Z999',
          carrier: 'UPS',
          status: 'shipped',
          expected_delivery: '2026-04-02',
          actual_delivery: null,
          created_at: '2026-03-28T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/packages');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].merchant).toBe('Amazon');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status != 'delivered'"),
      );
    });

    it('returns empty array when no active packages', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/packages');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/packages');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('GET /packages/all', () => {
    it('returns all packages including delivered', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'p1',
          merchant: 'Amazon',
          status: 'delivered',
          tracking_number: '1Z999',
          carrier: 'UPS',
          expected_delivery: '2026-04-01',
          actual_delivery: '2026-03-31',
          created_at: '2026-03-28T10:00:00Z',
        },
        {
          id: 'p2',
          merchant: 'Best Buy',
          status: 'shipped',
          tracking_number: 'FX123',
          carrier: 'FedEx',
          expected_delivery: '2026-04-05',
          actual_delivery: null,
          created_at: '2026-03-30T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/packages/all');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/packages/all');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /packages', () => {
    it('creates a new package', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/packages').send({
        merchant: 'Amazon',
        tracking_number: '1Z999AA10',
        carrier: 'UPS',
        expected_delivery: '2026-04-05',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.merchant).toBe('Amazon');
      expect(res.body.tracking_number).toBe('1Z999AA10');
      expect(res.body.id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.packages'),
        expect.any(String),
        'Amazon',
        '1Z999AA10',
        'UPS',
        '2026-04-05',
      );
    });

    it('creates package with minimal fields', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/packages').send({
        merchant: 'eBay',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.merchant).toBe('eBay');
      expect(res.body.tracking_number).toBeNull();
      expect(res.body.carrier).toBeNull();
    });

    it('returns 400 for missing merchant', async () => {
      const res = await request(createApp()).post('/packages').send({
        tracking_number: '1Z999',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('merchant');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/packages').send({
        merchant: 'Amazon',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /packages/:id', () => {
    it('updates package status', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).put('/packages/p1').send({
        status: 'in-transit',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lifeos.packages SET status'),
        'in-transit',
        'p1',
      );
    });

    it('sets actual_delivery when status is delivered', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).put('/packages/p1').send({
        status: 'delivered',
      });

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CURRENT_TIMESTAMP'),
        'delivered',
        'p1',
      );
    });

    it('returns 400 for invalid status', async () => {
      const res = await request(createApp()).put('/packages/p1').send({
        status: 'lost',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status must be');
    });

    it('returns 400 for missing status', async () => {
      const res = await request(createApp()).put('/packages/p1').send({});

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).put('/packages/p1').send({
        status: 'shipped',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /packages/:id', () => {
    it('deletes a package', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).delete('/packages/p1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM lifeos.packages'),
        'p1',
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).delete('/packages/p1');

      expect(res.status).toBe(500);
    });
  });
});
