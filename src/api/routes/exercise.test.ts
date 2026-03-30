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

import { exerciseRouter } from './exercise.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/exercise', exerciseRouter);
  return app;
}

describe('exercise routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /exercise/today', () => {
    it('returns today exercise log entries', async () => {
      mockQuery.mockResolvedValue([
        {
          id: '1',
          log_date: '2026-03-29',
          exercise_type: 'Running',
          duration_min: 30,
          sets: null,
          reps: null,
          weight_kg: null,
          distance_km: 5.0,
          calories_burned: 300,
          notes: 'Easy pace',
          created_at: '2026-03-29T08:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/exercise/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].exercise_type).toBe('Running');
      expect(res.body.data[0].duration_min).toBe(30);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM lifeos.exercise_log'),
      );
    });

    it('returns empty array when no exercises today', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/exercise/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/exercise/today');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('GET /exercise/history', () => {
    it('returns history with default 30 days', async () => {
      mockQuery.mockResolvedValue([
        {
          log_date: '2026-03-28',
          exercise_count: 2,
          total_duration: 60,
          total_calories: 500,
        },
        {
          log_date: '2026-03-29',
          exercise_count: 1,
          total_duration: 30,
          total_calories: 300,
        },
      ]);

      const res = await request(createApp()).get('/exercise/history');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(30);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].exercise_count).toBe(2);
    });

    it('accepts custom days parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/exercise/history?days=7');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(7);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '7' DAY"),
      );
    });

    it('returns 400 for invalid days', async () => {
      const res = await request(createApp()).get('/exercise/history?days=abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('days must be');
    });

    it('returns 400 for days out of range', async () => {
      const res = await request(createApp()).get('/exercise/history?days=0');
      expect(res.status).toBe(400);
    });

    it('returns 400 for days above 365', async () => {
      const res = await request(createApp()).get('/exercise/history?days=400');
      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/exercise/history?days=7');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /exercise/log', () => {
    it('inserts a cardio exercise entry', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/exercise/log').send({
        exercise_type: 'Running',
        duration_min: 30,
        distance_km: 5.0,
        calories_burned: 300,
        notes: 'Morning run',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.exercise_log'),
      );
    });

    it('inserts a strength exercise entry', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/exercise/log').send({
        exercise_type: 'Bench Press',
        sets: 3,
        reps: 10,
        weight_kg: 60,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();
    });

    it('inserts entry with only exercise_type', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/exercise/log').send({
        exercise_type: 'Yoga',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('NULL'),
      );
    });

    it('returns 400 when exercise_type is missing', async () => {
      const res = await request(createApp()).post('/exercise/log').send({
        duration_min: 30,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('exercise_type is required');
    });

    it('returns 400 when exercise_type is not a string', async () => {
      const res = await request(createApp()).post('/exercise/log').send({
        exercise_type: 123,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('exercise_type is required');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/exercise/log').send({
        exercise_type: 'Running',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /exercise/:id', () => {
    it('deletes an exercise entry', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).delete('/exercise/abc-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = 'abc-123'"),
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).delete('/exercise/abc-123');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /exercise/templates', () => {
    it('returns templates ordered by category and name', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 't1',
          name: 'Running',
          category: 'cardio',
          default_sets: null,
          default_reps: null,
          muscles_targeted: null,
        },
        {
          id: 't2',
          name: 'Bench Press',
          category: 'strength',
          default_sets: 3,
          default_reps: 10,
          muscles_targeted: ['chest', 'triceps'],
        },
      ]);

      const res = await request(createApp()).get('/exercise/templates');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Running');
      expect(res.body.data[1].default_sets).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY category, name'),
      );
    });

    it('returns empty array when no templates exist', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/exercise/templates');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/exercise/templates');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /exercise/templates', () => {
    it('creates a cardio template', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/exercise/templates')
        .send({ name: 'Running', category: 'cardio' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.exercise_templates'),
      );
    });

    it('creates a strength template with defaults', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/exercise/templates')
        .send({
          name: 'Bench Press',
          category: 'strength',
          default_sets: 3,
          default_reps: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(createApp())
        .post('/exercise/templates')
        .send({ category: 'cardio' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name is required');
    });

    it('returns 400 when category is missing', async () => {
      const res = await request(createApp())
        .post('/exercise/templates')
        .send({ name: 'Running' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('category is required');
    });

    it('returns 400 for invalid category', async () => {
      const res = await request(createApp())
        .post('/exercise/templates')
        .send({ name: 'Running', category: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('category must be one of');
    });

    it('accepts flexibility category', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/exercise/templates')
        .send({ name: 'Yoga', category: 'flexibility' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts sports category', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/exercise/templates')
        .send({ name: 'Basketball', category: 'sports' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp())
        .post('/exercise/templates')
        .send({ name: 'Running', category: 'cardio' });

      expect(res.status).toBe(500);
    });
  });
});
