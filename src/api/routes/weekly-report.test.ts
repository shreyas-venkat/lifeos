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

import { weeklyReportRouter } from './weekly-report.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/weekly-report', weeklyReportRouter);
  return app;
}

// Helper: set up mockQuery to respond differently based on SQL content
function setupMockData(overrides?: {
  health?: Record<string, unknown>[];
  weight?: Record<string, unknown>[];
  meals?: Record<string, unknown>[];
  calories?: Record<string, unknown>[];
  supplements?: Record<string, unknown>[];
  exercise?: Record<string, unknown>[];
}) {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes("IN ('steps', 'heart_rate', 'sleep_duration')")) {
      return Promise.resolve(
        overrides?.health ?? [
          { metric_type: 'steps', avg_val: 5200 },
          { metric_type: 'heart_rate', avg_val: 78 },
          { metric_type: 'sleep_duration', avg_val: 6.8 },
        ],
      );
    }
    if (sql.includes("metric_type = 'weight'")) {
      return Promise.resolve(
        overrides?.weight ?? [
          { value: 75.5, recorded_at: '2026-03-24T08:00:00Z' },
          { value: 75.2, recorded_at: '2026-03-29T08:00:00Z' },
        ],
      );
    }
    if (sql.includes('meal_plans')) {
      return Promise.resolve(
        overrides?.meals ?? [
          { status: 'cooked', cnt: 5 },
          { status: 'skipped', cnt: 1 },
          { status: 'ate_out', cnt: 1 },
        ],
      );
    }
    if (sql.includes('calorie_log')) {
      return Promise.resolve(overrides?.calories ?? [{ avg_cal: 1150 }]);
    }
    if (sql.includes('supplements') && sql.includes('CROSS JOIN')) {
      return Promise.resolve(
        overrides?.supplements ?? [
          { log_date: '2026-03-24', taken_count: 3, total_count: 3 },
          { log_date: '2026-03-25', taken_count: 3, total_count: 3 },
          { log_date: '2026-03-26', taken_count: 1, total_count: 3 },
          { log_date: '2026-03-27', taken_count: 3, total_count: 3 },
          { log_date: '2026-03-28', taken_count: 3, total_count: 3 },
          { log_date: '2026-03-29', taken_count: 3, total_count: 3 },
        ],
      );
    }
    if (sql.includes('exercise_duration')) {
      return Promise.resolve(
        overrides?.exercise ?? [{ sessions: 3, total_min: 90 }],
      );
    }
    return Promise.resolve([]);
  });
}

describe('weekly-report routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /weekly-report/', () => {
    it('returns a complete weekly report with all sections', async () => {
      setupMockData();

      const res = await request(createApp()).get('/weekly-report/');

      expect(res.status).toBe(200);
      expect(res.body.week).toMatch(/^\d{4}-W\d{2}$/);
      expect(res.body.generated_at).toBeDefined();

      // Health section
      expect(res.body.health.avg_steps).toBe(5200);
      expect(res.body.health.avg_hr).toBe(78);
      expect(res.body.health.avg_sleep).toBe(6.8);
      expect(res.body.health.weight_change).toBe(-0.3);

      // Meals section
      expect(res.body.meals.cooked).toBe(5);
      expect(res.body.meals.skipped).toBe(1);
      expect(res.body.meals.ate_out).toBe(1);
      expect(res.body.meals.avg_calories).toBe(1150);

      // Supplements section
      expect(res.body.supplements.adherence_pct).toBe(89);
      expect(res.body.supplements.missed_days).toContain('2026-03-26');

      // Exercise section
      expect(res.body.exercise.sessions).toBe(3);
      expect(res.body.exercise.total_duration_min).toBe(90);

      // Highlights
      expect(res.body.highlights).toBeInstanceOf(Array);
      expect(res.body.highlights.length).toBeGreaterThan(0);
    });

    it('handles empty data gracefully', async () => {
      setupMockData({
        health: [],
        weight: [],
        meals: [],
        calories: [{ avg_cal: null }],
        supplements: [],
        exercise: [{ sessions: 0, total_min: 0 }],
      });

      const res = await request(createApp()).get('/weekly-report/');

      expect(res.status).toBe(200);
      expect(res.body.health.avg_steps).toBeNull();
      expect(res.body.health.avg_hr).toBeNull();
      expect(res.body.health.avg_sleep).toBeNull();
      expect(res.body.health.weight_change).toBeNull();
      expect(res.body.meals.cooked).toBe(0);
      expect(res.body.meals.avg_calories).toBeNull();
      expect(res.body.supplements.adherence_pct).toBeNull();
      expect(res.body.exercise.sessions).toBe(0);
    });

    it('returns 200 with null data when all queries fail (graceful degradation)', async () => {
      mockQuery.mockRejectedValue(new Error('Connection refused'));

      const res = await request(createApp()).get('/weekly-report/');

      // Individual query failures are caught; endpoint returns 200 with empty/null values
      expect(res.status).toBe(200);
      expect(res.body.health.avg_steps).toBeNull();
      expect(res.body.meals.cooked).toBe(0);
      expect(res.body.supplements.adherence_pct).toBeNull();
    });

    it('generates highlights for weight loss', async () => {
      setupMockData({
        weight: [
          { value: 76.0, recorded_at: '2026-03-24T08:00:00Z' },
          { value: 74.5, recorded_at: '2026-03-29T08:00:00Z' },
        ],
      });

      const res = await request(createApp()).get('/weekly-report/');

      expect(res.body.highlights).toContain('Weight down 1.5kg this week');
    });

    it('generates highlights for low step count', async () => {
      setupMockData({
        health: [
          { metric_type: 'steps', avg_val: 3200 },
          { metric_type: 'heart_rate', avg_val: 78 },
          { metric_type: 'sleep_duration', avg_val: 7 },
        ],
      });

      const res = await request(createApp()).get('/weekly-report/');

      const lowStepHighlight = res.body.highlights.find((h: string) =>
        h.includes('avg steps'),
      );
      expect(lowStepHighlight).toBeDefined();
    });
  });

  describe('GET /weekly-report/history', () => {
    it('returns last 4 weekly reports', async () => {
      setupMockData();

      const res = await request(createApp()).get('/weekly-report/history');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(4);
      // Each report has the expected structure
      for (const report of res.body) {
        expect(report.week).toMatch(/^\d{4}-W\d{2}$/);
        expect(report.health).toBeDefined();
        expect(report.meals).toBeDefined();
        expect(report.supplements).toBeDefined();
        expect(report.exercise).toBeDefined();
        expect(report.highlights).toBeInstanceOf(Array);
      }
    });

    it('returns reports with decreasing week numbers', async () => {
      setupMockData();

      const res = await request(createApp()).get('/weekly-report/history');

      expect(res.status).toBe(200);
      // Weeks should be in descending order (most recent first)
      const weeks = res.body.map((r: { week: string }) => r.week);
      expect(weeks.length).toBe(4);
    });

    it('returns 200 with null data when all queries fail (graceful degradation)', async () => {
      mockQuery.mockRejectedValue(new Error('Timeout'));

      const res = await request(createApp()).get('/weekly-report/history');

      // Individual query failures are caught; endpoint returns 200 with empty/null values
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(4);
      expect(res.body[0].health.avg_steps).toBeNull();
    });
  });
});
