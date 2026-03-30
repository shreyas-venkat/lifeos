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

import { exportRouter } from './export.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/export', exportRouter);
  return app;
}

describe('export routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /export/health?format=json', () => {
    it('returns health metrics as JSON array', async () => {
      const rows = [
        {
          id: '1',
          metric_type: 'steps',
          value: 7200,
          recorded_at: '2026-03-29T10:00:00Z',
        },
        {
          id: '2',
          metric_type: 'heart_rate',
          value: 72,
          recorded_at: '2026-03-29T09:00:00Z',
        },
      ];
      mockQuery.mockResolvedValue(rows);

      const res = await request(createApp()).get('/export/health?format=json');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].metric_type).toBe('steps');
      expect(res.body[1].value).toBe(72);
    });

    it('defaults to JSON when no format specified', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/export/health');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /export/health?format=csv', () => {
    it('returns CSV with correct headers and content-type', async () => {
      const rows = [
        {
          id: '1',
          metric_type: 'steps',
          value: 7200,
          recorded_at: '2026-03-29T10:00:00Z',
        },
        {
          id: '2',
          metric_type: 'heart_rate',
          value: 72,
          recorded_at: '2026-03-29T09:00:00Z',
        },
      ];
      mockQuery.mockResolvedValue(rows);

      const res = await request(createApp()).get('/export/health?format=csv');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toContain(
        'health_metrics.csv',
      );

      const lines = res.text.split('\n');
      expect(lines[0]).toBe('id,metric_type,value,recorded_at');
      expect(lines[1]).toBe('1,steps,7200,2026-03-29T10:00:00Z');
      expect(lines).toHaveLength(3);
    });

    it('returns empty string for no data', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/export/health?format=csv');

      expect(res.status).toBe(200);
      expect(res.text).toBe('');
    });

    it('escapes CSV values with commas and quotes', async () => {
      const rows = [
        { id: '1', description: 'has, comma', notes: 'has "quotes"' },
      ];
      mockQuery.mockResolvedValue(rows);

      const res = await request(createApp()).get('/export/health?format=csv');
      const lines = res.text.split('\n');
      expect(lines[1]).toBe('1,"has, comma","has ""quotes"""');
    });
  });

  describe('GET /export/health - invalid format', () => {
    it('returns 400 for invalid format', async () => {
      const res = await request(createApp()).get('/export/health?format=xml');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('format must be');
    });
  });

  describe('GET /export/health - database error', () => {
    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB down'));

      const res = await request(createApp()).get('/export/health?format=json');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB down');
    });
  });

  describe('GET /export/all?format=json', () => {
    it('returns all tables in a single JSON object', async () => {
      // Mock query for each table -- called in parallel
      mockQuery.mockResolvedValue([{ id: '1', sample: 'data' }]);

      const res = await request(createApp()).get('/export/all?format=json');

      expect(res.status).toBe(200);
      expect(res.body.exported_at).toBeDefined();
      expect(res.body.health_metrics).toBeDefined();
      expect(res.body.supplements).toBeDefined();
      expect(res.body.supplement_log).toBeDefined();
      expect(res.body.recipes).toBeDefined();
      expect(res.body.meal_plans).toBeDefined();
      expect(res.body.calorie_log).toBeDefined();
      expect(res.body.pantry).toBeDefined();
      expect(res.body.preferences).toBeDefined();
      expect(res.body.emails).toBeDefined();
      expect(res.body.bills).toBeDefined();
      expect(res.body.reminders).toBeDefined();
    });

    it('returns empty arrays for tables that fail', async () => {
      // Some tables succeed, some fail
      let callCount = 0;
      mockQuery.mockImplementation(() => {
        callCount++;
        if (callCount % 3 === 0) {
          return Promise.reject(new Error('Table not found'));
        }
        return Promise.resolve([{ id: String(callCount) }]);
      });

      const res = await request(createApp()).get('/export/all?format=json');

      expect(res.status).toBe(200);
      expect(res.body.exported_at).toBeDefined();
      // All table keys should exist (some empty, some with data)
      expect(Object.keys(res.body)).toContain('health_metrics');
      expect(Object.keys(res.body)).toContain('reminders');
    });

    it('returns 400 for non-json format on /all', async () => {
      const res = await request(createApp()).get('/export/all?format=csv');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('format must be "json"');
    });
  });
});
