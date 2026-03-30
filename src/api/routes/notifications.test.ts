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

vi.mock('crypto', () => ({
  default: { randomUUID: () => 'test-uuid-1234' },
}));

import { notificationsRouter } from './notifications.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/notifications', notificationsRouter);
  return app;
}

describe('notifications routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /notifications/pending', () => {
    it('returns unseen notifications', async () => {
      mockQuery.mockResolvedValue([
        {
          id: 'n1',
          title: 'Morning briefing',
          body: 'Time for your daily review',
          type: 'info',
          url: '/app',
          created_at: '2026-03-29T06:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/notifications/pending');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Morning briefing');
      expect(res.body.data[0].type).toBe('info');
    });

    it('returns empty array when no pending notifications', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/notifications/pending');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB connection failed'));

      const res = await request(createApp()).get('/notifications/pending');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB connection failed');
    });
  });

  describe('POST /notifications/mark-seen', () => {
    it('marks notifications as seen', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/notifications/mark-seen')
        .send({ ids: ['n1', 'n2'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lifeos.notifications SET seen = TRUE'),
        'n1',
        'n2',
      );
    });

    it('returns 400 when ids is missing', async () => {
      const res = await request(createApp())
        .post('/notifications/mark-seen')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-empty array');
    });

    it('returns 400 when ids is empty array', async () => {
      const res = await request(createApp())
        .post('/notifications/mark-seen')
        .send({ ids: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-empty array');
    });

    it('returns 400 when ids contains non-strings', async () => {
      const res = await request(createApp())
        .post('/notifications/mark-seen')
        .send({ ids: [123, 'valid'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('each id must be a string');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query failed'));

      const res = await request(createApp())
        .post('/notifications/mark-seen')
        .send({ ids: ['n1'] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Query failed');
    });
  });

  describe('POST /notifications/send', () => {
    it('creates a notification with defaults', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp())
        .post('/notifications/send')
        .send({ title: 'Test', body: 'Hello world' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe('test-uuid-1234');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.notifications'),
        'test-uuid-1234',
        'Test',
        'Hello world',
        'info',
        null,
      );
    });

    it('creates a notification with all fields', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).post('/notifications/send').send({
        title: 'Warning',
        body: 'Low pantry stock',
        type: 'warning',
        url: '/app/pantry',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO lifeos.notifications'),
        'test-uuid-1234',
        'Warning',
        'Low pantry stock',
        'warning',
        '/app/pantry',
      );
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(createApp())
        .post('/notifications/send')
        .send({ body: 'No title' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('title');
    });

    it('returns 400 when body is missing', async () => {
      const res = await request(createApp())
        .post('/notifications/send')
        .send({ title: 'No body' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('body');
    });

    it('returns 400 for invalid type', async () => {
      const res = await request(createApp())
        .post('/notifications/send')
        .send({ title: 'Test', body: 'Hello', type: 'critical' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type must be one of');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Insert failed'));

      const res = await request(createApp())
        .post('/notifications/send')
        .send({ title: 'Test', body: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Insert failed');
    });
  });
});
