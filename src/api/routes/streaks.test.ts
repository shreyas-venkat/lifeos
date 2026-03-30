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

import { streaksRouter } from './streaks.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/streaks', streaksRouter);
  return app;
}

// Today's date for streak calculations
const TODAY = new Date().toISOString().split('T')[0];
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

describe('streaks routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('GET /streaks', () => {
    it('returns all streak types with computed values', async () => {
      // Query order (sequential):
      // 1. supplements count
      // 2. supplements daily (raw: log_date + taken_count, mapped to all_taken)
      // 3. cooking (raw: log_date + cooked_count, mapped to cooked)
      // 4. steps (raw: log_date + max_steps, mapped to met_goal)
      // 5. water (raw: log_date + total_glasses, mapped to met_goal)
      // 6. sleep (raw: log_date + sleep_hours, mapped to met_goal)
      // 7. exercise (raw: log_date + entry_count, mapped to has_entry)
      // 8. stored streaks
      mockQuery
        // 1. supplements: active count = 3
        .mockResolvedValueOnce([{ total: 3 }])
        // 2. supplements daily: 3 consecutive days all taken (taken_count >= 3)
        .mockResolvedValueOnce([
          { log_date: TODAY, taken_count: 3 },
          { log_date: daysAgo(1), taken_count: 3 },
          { log_date: daysAgo(2), taken_count: 3 },
          { log_date: daysAgo(3), taken_count: 1 }, // not all taken
        ])
        // 3. cooking: 1 day
        .mockResolvedValueOnce([
          { log_date: TODAY, cooked_count: 2 },
          { log_date: daysAgo(1), cooked_count: 0 },
        ])
        // 4. steps: 5 consecutive days >= 5000
        .mockResolvedValueOnce([
          { log_date: TODAY, max_steps: 8000 },
          { log_date: daysAgo(1), max_steps: 6000 },
          { log_date: daysAgo(2), max_steps: 7500 },
          { log_date: daysAgo(3), max_steps: 5100 },
          { log_date: daysAgo(4), max_steps: 5000 },
        ])
        // 5. water: 2 consecutive days
        .mockResolvedValueOnce([
          { log_date: TODAY, total_glasses: 10 },
          { log_date: daysAgo(1), total_glasses: 8 },
        ])
        // 6. sleep: 0 (today not met)
        .mockResolvedValueOnce([{ log_date: TODAY, sleep_hours: 5.5 }])
        // 7. exercise: 4 consecutive days
        .mockResolvedValueOnce([
          { log_date: TODAY, entry_count: 1 },
          { log_date: daysAgo(1), entry_count: 2 },
          { log_date: daysAgo(2), entry_count: 1 },
          { log_date: daysAgo(3), entry_count: 1 },
          { log_date: daysAgo(4), entry_count: 0 },
        ])
        // 8. stored streaks
        .mockResolvedValueOnce([
          {
            streak_type: 'supplements',
            longest_streak: 10,
            target_value: null,
          },
          { streak_type: 'steps_goal', longest_streak: 3, target_value: 5000 },
        ]);

      const res = await request(createApp()).get('/streaks');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(6);

      const supps = res.body.data.find(
        (s: Record<string, unknown>) => s.type === 'supplements',
      );
      expect(supps.currentStreak).toBe(3);
      expect(supps.longestStreak).toBe(10); // stored > current

      const cooking = res.body.data.find(
        (s: Record<string, unknown>) => s.type === 'cooking',
      );
      expect(cooking.currentStreak).toBe(1);

      const steps = res.body.data.find(
        (s: Record<string, unknown>) => s.type === 'steps_goal',
      );
      expect(steps.currentStreak).toBe(5);
      expect(steps.longestStreak).toBe(5); // current > stored (3)

      const water = res.body.data.find(
        (s: Record<string, unknown>) => s.type === 'water_goal',
      );
      expect(water.currentStreak).toBe(2);

      const sleep = res.body.data.find(
        (s: Record<string, unknown>) => s.type === 'sleep_target',
      );
      expect(sleep.currentStreak).toBe(0);

      const exercise = res.body.data.find(
        (s: Record<string, unknown>) => s.type === 'exercise',
      );
      expect(exercise.currentStreak).toBe(4);
    });

    it('returns zero streak when no data', async () => {
      mockQuery
        .mockResolvedValueOnce([{ total: 0 }]) // no active supplements
        // supplements daily skipped (totalActive = 0)
        .mockResolvedValueOnce([]) // cooking
        .mockResolvedValueOnce([]) // steps
        .mockResolvedValueOnce([]) // water
        .mockResolvedValueOnce([]) // sleep
        .mockResolvedValueOnce([]) // exercise
        .mockResolvedValueOnce([]); // stored streaks

      const res = await request(createApp()).get('/streaks');

      expect(res.status).toBe(200);
      for (const streak of res.body.data) {
        expect(streak.currentStreak).toBe(0);
      }
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('DB connection failed'));

      const res = await request(createApp()).get('/streaks');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB connection failed');
    });
  });

  describe('GET /streaks/history', () => {
    it('returns daily completion status for supplements', async () => {
      mockQuery
        // 1. supplements count
        .mockResolvedValueOnce([{ total: 3 }])
        // 2. supplements daily (raw taken_count)
        .mockResolvedValueOnce([
          { log_date: TODAY, taken_count: 3 },
          { log_date: daysAgo(1), taken_count: 1 },
          { log_date: daysAgo(2), taken_count: 3 },
        ]);

      const res = await request(createApp()).get(
        '/streaks/history?type=supplements&days=30',
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(30);

      const todayEntry = res.body.data.find(
        (d: Record<string, unknown>) => d.date === TODAY,
      );
      expect(todayEntry.completed).toBe(true);

      const yesterdayEntry = res.body.data.find(
        (d: Record<string, unknown>) => d.date === daysAgo(1),
      );
      expect(yesterdayEntry.completed).toBe(false); // only 1/3 taken
    });

    it('returns daily completion for cooking', async () => {
      mockQuery.mockResolvedValueOnce([{ log_date: TODAY, cooked_count: 1 }]);

      const res = await request(createApp()).get(
        '/streaks/history?type=cooking&days=7',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(7);
      const todayEntry = res.body.data.find(
        (d: Record<string, unknown>) => d.date === TODAY,
      );
      expect(todayEntry.completed).toBe(true);
    });

    it('returns 400 for invalid streak type', async () => {
      const res = await request(createApp()).get(
        '/streaks/history?type=invalid&days=30',
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type must be one of');
    });

    it('returns 400 for missing type', async () => {
      const res = await request(createApp()).get('/streaks/history?days=30');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid days', async () => {
      const res = await request(createApp()).get(
        '/streaks/history?type=supplements&days=abc',
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for days out of range', async () => {
      const res = await request(createApp()).get(
        '/streaks/history?type=supplements&days=400',
      );
      expect(res.status).toBe(400);
    });

    it('defaults to 30 days when not specified', async () => {
      mockQuery.mockResolvedValueOnce([{ total: 2 }]).mockResolvedValueOnce([]);

      const res = await request(createApp()).get(
        '/streaks/history?type=supplements',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(30);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const res = await request(createApp()).get(
        '/streaks/history?type=cooking&days=7',
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Query timeout');
    });
  });
});
