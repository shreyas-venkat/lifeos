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

import { remindersRouter } from './reminders.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/reminders', remindersRouter);
  return app;
}

describe('reminders routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /reminders', () => {
    it('returns active reminders ordered by due_at', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'r1',
          message: 'Buy groceries',
          due_at: '2026-04-01T10:00:00Z',
          recurring_cron: null,
          status: 'active',
          created_at: '2026-03-29T10:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/reminders');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].message).toBe('Buy groceries');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'active'"),
      );
    });

    it('returns empty array when no active reminders', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/reminders');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).get('/reminders');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('POST /reminders', () => {
    it('creates a new reminder with message and due_at', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/reminders').send({
        message: 'Call dentist',
        due_at: '2026-04-01T14:00:00Z',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.reminders'),
        expect.any(String),
        'Call dentist',
        '2026-04-01T14:00:00Z',
        null,
      );
    });

    it('creates a recurring reminder', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/reminders').send({
        message: 'Take vitamins',
        due_at: '2026-04-01T08:00:00Z',
        recurring_cron: '0 8 * * *',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.reminders'),
        expect.any(String),
        'Take vitamins',
        '2026-04-01T08:00:00Z',
        '0 8 * * *',
      );
    });

    it('returns 400 when message is missing', async () => {
      const res = await request(createApp()).post('/reminders').send({
        due_at: '2026-04-01T14:00:00Z',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });

    it('returns 400 when due_at is missing', async () => {
      const res = await request(createApp()).post('/reminders').send({
        message: 'Test',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('due_at is required');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).post('/reminders').send({
        message: 'Test',
        due_at: '2026-04-01T14:00:00Z',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /reminders/:id', () => {
    it('updates message and due_at', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).put('/reminders/r1').send({
        message: 'Updated message',
        due_at: '2026-04-02T10:00:00Z',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lifeos.reminders'),
        'Updated message',
        '2026-04-02T10:00:00Z',
        'r1',
      );
    });

    it('updates only message', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).put('/reminders/r1').send({
        message: 'New message',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('updates only due_at', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).put('/reminders/r1').send({
        due_at: '2026-04-02T10:00:00Z',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when no fields provided', async () => {
      const res = await request(createApp()).put('/reminders/r1').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message or due_at is required');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).put('/reminders/r1').send({
        message: 'Test',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /reminders/:id', () => {
    it('deletes a reminder by id', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).delete('/reminders/r1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM lifeos.reminders'),
        'r1',
      );
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const res = await request(createApp()).delete('/reminders/r1');

      expect(res.status).toBe(500);
    });
  });
});
