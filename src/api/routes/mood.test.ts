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

import { moodRouter } from './mood.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/mood', moodRouter);
  return app;
}

describe('mood routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /mood/today', () => {
    it('returns today mood entries', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'm1',
          mood: 4,
          energy: 3,
          notes: 'Feeling good',
          log_date: '2026-03-29',
          log_time: 'morning',
          created_at: '2026-03-29T08:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/mood/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].mood).toBe(4);
      expect(res.body.data[0].energy).toBe(3);
    });

    it('returns empty array when no entries for today', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/mood/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/mood/today');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('POST /mood/log', () => {
    it('creates a new mood entry', async () => {
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const res = await request(createApp()).post('/mood/log').send({
        mood: 4,
        energy: 3,
        notes: 'Had a good sleep',
        log_time: 'morning',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(res.body.updated).toBe(false);
    });

    it('updates existing entry for same date and time', async () => {
      mockQuery.mockResolvedValueOnce([{ id: 'm1' }]).mockResolvedValueOnce([]);

      const res = await request(createApp()).post('/mood/log').send({
        mood: 5,
        energy: 4,
        notes: 'Even better now',
        log_time: 'morning',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe('m1');
      expect(res.body.updated).toBe(true);
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE lifeos.mood_log'),
        5,
        4,
        'Even better now',
        'm1',
      );
    });

    it('defaults to morning when log_time not provided', async () => {
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const res = await request(createApp()).post('/mood/log').send({
        mood: 3,
        energy: 3,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM lifeos.mood_log'),
        'morning',
      );
    });

    it('accepts afternoon log_time', async () => {
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const res = await request(createApp()).post('/mood/log').send({
        mood: 3,
        energy: 2,
        log_time: 'afternoon',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts evening log_time', async () => {
      mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const res = await request(createApp()).post('/mood/log').send({
        mood: 3,
        energy: 2,
        log_time: 'evening',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when mood is missing', async () => {
      const res = await request(createApp()).post('/mood/log').send({
        energy: 3,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('mood is required');
    });

    it('returns 400 when mood is not a number', async () => {
      const res = await request(createApp()).post('/mood/log').send({
        mood: 'great',
        energy: 3,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('mood is required');
    });

    it('returns 400 when mood is below 1', async () => {
      const res = await request(createApp()).post('/mood/log').send({
        mood: 0,
        energy: 3,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('mood must be between 1 and 5');
    });

    it('returns 400 when mood is above 5', async () => {
      const res = await request(createApp()).post('/mood/log').send({
        mood: 6,
        energy: 3,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('mood must be between 1 and 5');
    });

    it('returns 400 when energy is missing', async () => {
      const res = await request(createApp()).post('/mood/log').send({
        mood: 3,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('energy is required');
    });

    it('returns 400 when energy is below 1', async () => {
      const res = await request(createApp()).post('/mood/log').send({
        mood: 3,
        energy: 0,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('energy must be between 1 and 5');
    });

    it('returns 400 when energy is above 5', async () => {
      const res = await request(createApp()).post('/mood/log').send({
        mood: 3,
        energy: 6,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('energy must be between 1 and 5');
    });

    it('returns 400 for invalid log_time', async () => {
      const res = await request(createApp()).post('/mood/log').send({
        mood: 3,
        energy: 3,
        log_time: 'midnight',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('log_time must be');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/mood/log').send({
        mood: 3,
        energy: 3,
      });

      expect(res.status).toBe(500);
    });
  });

  describe('GET /mood/history', () => {
    it('returns mood history for default 30 days', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'm1',
          mood: 4,
          energy: 3,
          notes: null,
          log_date: '2026-03-29',
          log_time: 'morning',
          created_at: '2026-03-29T08:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/mood/history');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '30' DAY"),
      );
    });

    it('accepts custom days parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/mood/history?days=7');

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '7' DAY"),
      );
    });

    it('returns 400 for days below 1', async () => {
      const res = await request(createApp()).get('/mood/history?days=0');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('days must be a number');
    });

    it('returns 400 for days above 365', async () => {
      const res = await request(createApp()).get('/mood/history?days=400');

      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric days', async () => {
      const res = await request(createApp()).get('/mood/history?days=abc');

      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/mood/history');

      expect(res.status).toBe(500);
    });
  });
});
