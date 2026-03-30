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

import { healthContextRouter } from './health-context.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/health/context', healthContextRouter);
  return app;
}

describe('health context routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /health/context — validation', () => {
    it('returns 400 when metric is missing', async () => {
      const res = await request(createApp()).get(
        '/health/context?date=2026-03-28',
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('metric is required');
    });

    it('returns 400 for invalid metric', async () => {
      const res = await request(createApp()).get(
        '/health/context?metric=invalid&date=2026-03-28',
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('metric is required');
    });

    it('returns 400 for invalid date format', async () => {
      const res = await request(createApp()).get(
        '/health/context?metric=weight&date=not-a-date',
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('YYYY-MM-DD');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB connection failed'));

      const res = await request(createApp()).get(
        '/health/context?metric=weight&date=2026-03-28',
      );
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB connection failed');
    });
  });

  describe('GET /health/context?metric=weight', () => {
    it('returns weight context with all insights', async () => {
      // Call 1: metric value
      mockQuery.mockResolvedValueOnce([{ avg_value: 52.7 }]);
      // Call 2: calorie_log for date + day before
      mockQuery.mockResolvedValueOnce([
        {
          log_date: '2026-03-27',
          description: 'Cheesy Beef Pasta',
          calories: 800,
        },
        {
          log_date: '2026-03-28',
          description: 'Beef Rice Bowl',
          calories: 600,
        },
      ]);
      // Call 3: steps
      mockQuery.mockResolvedValueOnce([{ avg_value: 2100 }]);
      // Call 4: weight trend
      mockQuery.mockResolvedValueOnce([
        { date: '2026-03-21', avg_value: 53.0 },
        { date: '2026-03-28', avg_value: 52.7 },
      ]);

      const res = await request(createApp()).get(
        '/health/context?metric=weight&date=2026-03-28',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.metric).toBe('weight');
      expect(res.body.data.date).toBe('2026-03-28');
      expect(res.body.data.value).toBe(52.7);
      expect(res.body.data.insights).toHaveLength(3);
      expect(res.body.data.insights[0].source).toBe('calorie_log');
      expect(res.body.data.insights[0].type).toBe('neutral');
      expect(res.body.data.insights[1].source).toBe('health_metrics');
      expect(res.body.data.insights[1].type).toBe('negative');
      expect(res.body.data.insights[1].text).toContain('2,100');
      expect(res.body.data.insights[2].text).toContain('down');
      expect(res.body.data.insights[2].type).toBe('positive');
    });

    it('returns empty insights when no data exists', async () => {
      // metric value query
      mockQuery.mockResolvedValueOnce([{ avg_value: null }]);
      // calorie_log
      mockQuery.mockResolvedValueOnce([]);
      // steps
      mockQuery.mockResolvedValueOnce([{ avg_value: null }]);
      // weight trend
      mockQuery.mockResolvedValueOnce([]);

      const res = await request(createApp()).get(
        '/health/context?metric=weight&date=2026-03-28',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.value).toBeNull();
      expect(res.body.data.insights).toEqual([]);
    });
  });

  describe('GET /health/context?metric=heart_rate', () => {
    it('returns heart rate context with supplement and sleep insights', async () => {
      // metric value
      mockQuery.mockResolvedValueOnce([{ avg_value: 68 }]);
      // supplements
      mockQuery.mockResolvedValueOnce([
        { name: 'Ashwagandha', taken: true },
      ]);
      // sleep duration
      mockQuery.mockResolvedValueOnce([{ avg_value: 7.5 }]);
      // steps
      mockQuery.mockResolvedValueOnce([{ avg_value: 8500 }]);
      // exercise_log
      mockQuery.mockResolvedValueOnce([]);

      const res = await request(createApp()).get(
        '/health/context?metric=heart_rate&date=2026-03-28',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.value).toBe(68);
      expect(res.body.data.insights).toHaveLength(3);
      expect(res.body.data.insights[0].text).toContain('Ashwagandha');
      expect(res.body.data.insights[0].source).toBe('supplement_log');
      expect(res.body.data.insights[1].text).toContain('7.5h sleep');
      expect(res.body.data.insights[1].type).toBe('positive');
    });
  });

  describe('GET /health/context?metric=sleep_duration', () => {
    it('returns sleep context with supplement and meal insights', async () => {
      // metric value
      mockQuery.mockResolvedValueOnce([{ avg_value: 6.5 }]);
      // supplements
      mockQuery.mockResolvedValueOnce([
        { name: 'Melatonin', taken: true },
      ]);
      // late meals
      mockQuery.mockResolvedValueOnce([
        { description: 'Late Night Pizza', calories: 500 },
      ]);
      // steps
      mockQuery.mockResolvedValueOnce([{ avg_value: 9000 }]);

      const res = await request(createApp()).get(
        '/health/context?metric=sleep_duration&date=2026-03-28',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.insights).toHaveLength(3);
      expect(res.body.data.insights[0].text).toContain('Melatonin');
      expect(res.body.data.insights[0].type).toBe('positive');
      expect(res.body.data.insights[1].text).toContain('Late Night Pizza');
      expect(res.body.data.insights[1].type).toBe('negative');
      expect(res.body.data.insights[2].type).toBe('positive');
    });
  });

  describe('GET /health/context?metric=hrv', () => {
    it('returns HRV context with supplement and trend insights', async () => {
      // metric value
      mockQuery.mockResolvedValueOnce([{ avg_value: 45 }]);
      // supplements
      mockQuery.mockResolvedValueOnce([
        { name: 'Rhodiola', taken: true },
      ]);
      // sleep quality
      mockQuery.mockResolvedValueOnce([{ avg_value: 85 }]);
      // 7-day avg
      mockQuery.mockResolvedValueOnce([{ avg_value: 40 }]);
      // today value
      mockQuery.mockResolvedValueOnce([{ avg_value: 45 }]);

      const res = await request(createApp()).get(
        '/health/context?metric=hrv&date=2026-03-28',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.insights).toHaveLength(3);
      expect(res.body.data.insights[0].text).toContain('Rhodiola');
      expect(res.body.data.insights[1].text).toContain('85%');
      expect(res.body.data.insights[2].text).toContain('above');
      expect(res.body.data.insights[2].type).toBe('positive');
    });
  });

  describe('GET /health/context?metric=spo2', () => {
    it('flags when SpO2 is below 95%', async () => {
      // metric value
      mockQuery.mockResolvedValueOnce([{ avg_value: 93.5 }]);
      // spo2 value for flag
      mockQuery.mockResolvedValueOnce([{ avg_value: 93.5 }]);
      // sleep quality
      mockQuery.mockResolvedValueOnce([{ avg_value: 55 }]);

      const res = await request(createApp()).get(
        '/health/context?metric=spo2&date=2026-03-28',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.insights).toHaveLength(2);
      expect(res.body.data.insights[0].text).toContain('below normal');
      expect(res.body.data.insights[0].type).toBe('negative');
      expect(res.body.data.insights[1].text).toContain('poor sleep');
    });

    it('does not flag when SpO2 is normal', async () => {
      // metric value
      mockQuery.mockResolvedValueOnce([{ avg_value: 97 }]);
      // spo2 value
      mockQuery.mockResolvedValueOnce([{ avg_value: 97 }]);
      // sleep quality
      mockQuery.mockResolvedValueOnce([{ avg_value: 80 }]);

      const res = await request(createApp()).get(
        '/health/context?metric=spo2&date=2026-03-28',
      );

      expect(res.status).toBe(200);
      // No "below normal" insight when >= 95
      const flagInsight = res.body.data.insights.find(
        (i: { text: string }) => i.text.includes('below normal'),
      );
      expect(flagInsight).toBeUndefined();
    });
  });

  describe('GET /health/context?metric=steps', () => {
    it('returns steps context with calorie and trend insights', async () => {
      // metric value
      mockQuery.mockResolvedValueOnce([{ avg_value: 12000 }]);
      // calories
      mockQuery.mockResolvedValueOnce([{ calories: 2200 }]);
      // 7-day avg
      mockQuery.mockResolvedValueOnce([{ avg_value: 9000 }]);
      // today
      mockQuery.mockResolvedValueOnce([{ avg_value: 12000 }]);
      // exercise_log
      mockQuery.mockResolvedValueOnce([]);

      const res = await request(createApp()).get(
        '/health/context?metric=steps&date=2026-03-28',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.insights).toHaveLength(2);
      expect(res.body.data.insights[0].text).toContain('2,200');
      expect(res.body.data.insights[0].source).toBe('calorie_log');
      expect(res.body.data.insights[1].text).toContain('above');
      expect(res.body.data.insights[1].type).toBe('positive');
    });
  });

  describe('GET /health/context — date defaults', () => {
    it('defaults to today when date is not provided', async () => {
      mockQuery.mockResolvedValue([{ avg_value: null }]);

      const res = await request(createApp()).get(
        '/health/context?metric=weight',
      );

      expect(res.status).toBe(200);
      expect(res.body.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
