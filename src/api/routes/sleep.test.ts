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

import { sleepRouter } from './sleep.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/sleep', sleepRouter);
  return app;
}

describe('sleep routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /sleep/latest', () => {
    it('returns latest sleep entries', async () => {
      mockQuery.mockResolvedValue([
        {
          metric_type: 'sleep_duration',
          value: 7.5,
          unit: 'hours',
          recorded_at: '2026-03-29T07:00:00Z',
        },
        {
          metric_type: 'sleep_quality',
          value: 83,
          unit: null,
          recorded_at: '2026-03-29T07:00:00Z',
        },
      ]);

      const res = await request(createApp()).get('/sleep/latest');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].metric_type).toBe('sleep_duration');
      expect(res.body.data[0].value).toBe(7.5);
      expect(res.body.data[1].metric_type).toBe('sleep_quality');
    });

    it('returns empty array when no sleep data', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/sleep/latest');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB connection failed'));

      const res = await request(createApp()).get('/sleep/latest');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB connection failed');
    });
  });

  describe('GET /sleep/history', () => {
    it('returns sleep history with default 30 days', async () => {
      mockQuery.mockResolvedValue([
        {
          date: '2026-03-28',
          metric_type: 'sleep_duration',
          value: 7.2,
        },
        {
          date: '2026-03-28',
          metric_type: 'sleep_quality',
          value: 78,
        },
      ]);

      const res = await request(createApp()).get('/sleep/history');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(30);
      expect(res.body.data).toHaveLength(2);
    });

    it('accepts custom days parameter', async () => {
      mockQuery.mockResolvedValue([]);

      const res = await request(createApp()).get('/sleep/history?days=7');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(7);
    });

    it('returns 400 for invalid days', async () => {
      const res = await request(createApp()).get('/sleep/history?days=abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('days must be');
    });

    it('returns 400 for days out of range (0)', async () => {
      const res = await request(createApp()).get('/sleep/history?days=0');
      expect(res.status).toBe(400);
    });

    it('returns 400 for days exceeding 365', async () => {
      const res = await request(createApp()).get('/sleep/history?days=500');
      expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const res = await request(createApp()).get('/sleep/history?days=7');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Query timeout');
    });
  });

  describe('GET /sleep/insights', () => {
    it('returns supplement and activity insights', async () => {
      // Call 1: melatonin correlation
      mockQuery.mockResolvedValueOnce([
        {
          supplement_name: 'melatonin',
          taken_avg: 7.5,
          not_taken_avg: 6.2,
          taken_days: 10,
          not_taken_days: 20,
        },
      ]);
      // Call 2: magnesium correlation
      mockQuery.mockResolvedValueOnce([
        {
          supplement_name: 'magnesium',
          taken_avg: 7.3,
          not_taken_avg: 6.8,
          taken_days: 15,
          not_taken_days: 15,
        },
      ]);
      // Call 3: steps vs sleep
      mockQuery.mockResolvedValueOnce([
        { step_category: 'high', avg_sleep: 7.4, day_count: 12 },
        { step_category: 'low', avg_sleep: 6.6, day_count: 18 },
      ]);
      // Call 4: weekly goal
      mockQuery.mockResolvedValueOnce([
        { nights_on_target: 5, avg_duration: 7.2 },
      ]);
      // Call 5: sleep quality avg
      mockQuery.mockResolvedValueOnce([{ avg_quality: 76 }]);

      const res = await request(createApp()).get('/sleep/insights');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);

      // Check melatonin insight
      const melInsight = res.body.data.find((i: { text: string }) =>
        i.text.includes('Melatonin'),
      );
      expect(melInsight).toBeDefined();
      expect(melInsight.type).toBe('positive');
      expect(melInsight.text).toContain('7.5h');

      // Check steps insight
      const stepsInsight = res.body.data.find((i: { text: string }) =>
        i.text.includes('5000+'),
      );
      expect(stepsInsight).toBeDefined();
      expect(stepsInsight.text).toContain('48min');

      // Check weekly goal insight
      const goalInsight = res.body.data.find((i: { text: string }) =>
        i.text.includes('Weekly'),
      );
      expect(goalInsight).toBeDefined();
      expect(goalInsight.text).toContain('5 of 7');
    });

    it('handles empty data gracefully', async () => {
      // All queries return empty results
      mockQuery.mockResolvedValueOnce([]); // melatonin
      mockQuery.mockResolvedValueOnce([]); // magnesium
      mockQuery.mockResolvedValueOnce([]); // steps
      mockQuery.mockResolvedValueOnce([]); // weekly goal
      mockQuery.mockResolvedValueOnce([]); // quality avg

      const res = await request(createApp()).get('/sleep/insights');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('handles null averages in supplement data', async () => {
      // Melatonin with null averages
      mockQuery.mockResolvedValueOnce([
        {
          supplement_name: 'melatonin',
          taken_avg: null,
          not_taken_avg: 6.5,
          taken_days: 0,
          not_taken_days: 30,
        },
      ]);
      // Magnesium with null averages
      mockQuery.mockResolvedValueOnce([
        {
          supplement_name: 'magnesium',
          taken_avg: null,
          not_taken_avg: null,
          taken_days: 0,
          not_taken_days: 0,
        },
      ]);
      mockQuery.mockResolvedValueOnce([]); // steps
      mockQuery.mockResolvedValueOnce([]); // weekly goal
      mockQuery.mockResolvedValueOnce([]); // quality avg

      const res = await request(createApp()).get('/sleep/insights');

      expect(res.status).toBe(200);
      // No melatonin/magnesium insights since no taken_days
      expect(
        res.body.data.filter((i: { text: string }) =>
          i.text.includes('Melatonin'),
        ),
      ).toHaveLength(0);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query failed'));

      const res = await request(createApp()).get('/sleep/insights');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Query failed');
    });

    it('includes quality insight with correct type classification', async () => {
      mockQuery.mockResolvedValueOnce([]); // melatonin
      mockQuery.mockResolvedValueOnce([]); // magnesium
      mockQuery.mockResolvedValueOnce([]); // steps
      mockQuery.mockResolvedValueOnce([]); // weekly goal
      // Low quality
      mockQuery.mockResolvedValueOnce([{ avg_quality: 42 }]);

      const res = await request(createApp()).get('/sleep/insights');

      expect(res.status).toBe(200);
      const qualityInsight = res.body.data.find((i: { text: string }) =>
        i.text.includes('quality'),
      );
      expect(qualityInsight).toBeDefined();
      expect(qualityInsight.type).toBe('negative');
    });
  });
});
