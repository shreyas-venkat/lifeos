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

import { habitsRouter } from './habits.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/habits', habitsRouter);
  return app;
}

describe('habits routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /habits', () => {
    it('returns all active habits with today completion status', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'h1',
          name: 'Meditate',
          description: '10 min session',
          frequency: 'daily',
          target_per_day: 1,
          color: '#6366f1',
          icon: '\u2713',
          completed: 1,
          notes: null,
        },
        {
          id: 'h2',
          name: 'Read',
          description: null,
          frequency: 'daily',
          target_per_day: 1,
          color: '#22c55e',
          icon: '\u{1F4D6}',
          completed: 0,
          notes: null,
        },
      ]);

      const res = await request(createApp()).get('/habits');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Meditate');
      expect(res.body.data[0].completed).toBe(1);
      expect(res.body.data[1].completed).toBe(0);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('lifeos.habits'),
      );
    });

    it('returns empty array when no habits exist', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/habits');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/habits');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /habits', () => {
    it('creates a new habit with all fields', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/habits').send({
        name: 'Meditate',
        description: '10 min session',
        frequency: 'daily',
        target_per_day: 1,
        color: '#ef4444',
        icon: '\u{1F9D8}',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.name).toBe('Meditate');
      expect(res.body.description).toBe('10 min session');
      expect(res.body.frequency).toBe('daily');
      expect(res.body.color).toBe('#ef4444');
      expect(res.body.id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.habits'),
        expect.any(String),
        'Meditate',
        '10 min session',
        'daily',
        1,
        '#ef4444',
        '\u{1F9D8}',
      );
    });

    it('creates a habit with minimal fields and applies defaults', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/habits').send({
        name: 'Exercise',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.name).toBe('Exercise');
      expect(res.body.frequency).toBe('daily');
      expect(res.body.target_per_day).toBe(1);
      expect(res.body.color).toBe('#6366f1');
      expect(res.body.description).toBeNull();
    });

    it('returns 400 for missing name', async () => {
      const res = await request(createApp()).post('/habits').send({
        description: 'No name provided',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('returns 400 for empty name', async () => {
      const res = await request(createApp()).post('/habits').send({
        name: '   ',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('returns 400 for invalid frequency', async () => {
      const res = await request(createApp()).post('/habits').send({
        name: 'Test',
        frequency: 'monthly',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('frequency');
    });

    it('returns 400 for target_per_day less than 1', async () => {
      const res = await request(createApp()).post('/habits').send({
        name: 'Test',
        target_per_day: 0,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('target_per_day');
    });

    it('returns 400 for non-numeric target_per_day', async () => {
      const res = await request(createApp()).post('/habits').send({
        name: 'Test',
        target_per_day: 'abc',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('target_per_day');
    });

    it('accepts both valid frequencies', async () => {
      for (const frequency of ['daily', 'weekly']) {
        mockQuery.mockResolvedValue([]);
        const res = await request(createApp()).post('/habits').send({
          name: 'Test',
          frequency,
        });
        expect(res.status).toBe(200);
      }
    });

    it('trims whitespace from name', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/habits').send({
        name: '  Meditate  ',
      });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Meditate');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/habits').send({
        name: 'Test',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /habits/:id/complete', () => {
    it('creates new log entry when none exists today', async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 'h1', target_per_day: 1 }]) // habit exists
        .mockResolvedValueOnce([]) // no existing log
        .mockResolvedValueOnce([]); // insert

      const res = await request(createApp()).post('/habits/h1/complete');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.completed).toBe(1);
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO lifeos.habit_log'),
        expect.any(String),
        'h1',
      );
    });

    it('increments existing log entry', async () => {
      mockQuery
        .mockResolvedValueOnce([{ id: 'h1', target_per_day: 3 }]) // habit exists
        .mockResolvedValueOnce([{ id: 'log1', completed: 2 }]) // existing log
        .mockResolvedValueOnce([]); // update

      const res = await request(createApp()).post('/habits/h1/complete');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.completed).toBe(3);
      expect(mockQuery).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('UPDATE lifeos.habit_log'),
        3,
        'log1',
      );
    });

    it('returns 404 for non-existent habit', async () => {
      mockQuery.mockResolvedValueOnce([]); // no habit found

      const res = await request(createApp()).post(
        '/habits/nonexistent/complete',
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/habits/h1/complete');

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /habits/:id', () => {
    it('soft-deletes a habit by setting active=false', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).delete('/habits/h1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lifeos.habits SET active = false'),
        'h1',
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).delete('/habits/h1');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /habits/history', () => {
    it('returns history for default 30 days', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'h1',
          name: 'Meditate',
          color: '#6366f1',
          icon: '\u2713',
          target_per_day: 1,
          log_date: '2026-03-28',
          completed: 1,
        },
        {
          id: 'h1',
          name: 'Meditate',
          color: '#6366f1',
          icon: '\u2713',
          target_per_day: 1,
          log_date: '2026-03-27',
          completed: 1,
        },
      ]);

      const res = await request(createApp()).get('/habits/history');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '30' DAY"),
      );
    });

    it('accepts custom days parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/habits/history?days=7');

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '7' DAY"),
      );
    });

    it('returns 400 for days out of range', async () => {
      const res = await request(createApp()).get('/habits/history?days=0');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('days must be');
    });

    it('returns 400 for days above 365', async () => {
      const res = await request(createApp()).get('/habits/history?days=366');
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric days', async () => {
      const res = await request(createApp()).get('/habits/history?days=abc');
      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/habits/history');

      expect(res.status).toBe(500);
    });
  });
});
