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

  describe('POST /supplements/add', () => {
    it('inserts a new supplement and returns id', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/supplements/add').send({
        name: 'Vitamin D',
        default_dosage: 5000,
        unit: 'IU',
        time_of_day: 'morning',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.supplements'),
      );
    });

    it('inserts supplement with max_safe_dosage', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/supplements/add').send({
        name: 'Zinc',
        default_dosage: 30,
        unit: 'mg',
        time_of_day: 'morning',
        max_safe_dosage: 40,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(createApp()).post('/supplements/add').send({
        default_dosage: 5000,
        unit: 'IU',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name is required');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/supplements/add').send({
        name: 'Vitamin D',
        default_dosage: 5000,
        unit: 'IU',
        time_of_day: 'morning',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /supplements/:id', () => {
    it('deletes a supplement by id', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).delete('/supplements/abc-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM lifeos.supplements'),
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).delete('/supplements/abc-123');

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /supplements/:id', () => {
    it('updates dosage and time_of_day', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .put('/supplements/abc-123')
        .send({ default_dosage: 10000, time_of_day: 'evening' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lifeos.supplements'),
      );
    });

    it('updates active status', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .put('/supplements/abc-123')
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('active = false'),
      );
    });

    it('returns 400 when no fields provided', async () => {
      const res = await request(createApp())
        .put('/supplements/abc-123')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No fields to update');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp())
        .put('/supplements/abc-123')
        .send({ default_dosage: 10000 });

      expect(res.status).toBe(500);
    });
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
