import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockGetTodayEvents = vi.fn();
const mockGetEvents = vi.fn();

vi.mock('../../integrations/google-calendar.js', () => {
  return {
    GoogleCalendarClient: class MockGoogleCalendarClient {
      getTodayEvents = mockGetTodayEvents;
      getEvents = mockGetEvents;
    },
  };
});

import { calendarRouter } from './calendar.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/calendar', calendarRouter);
  return app;
}

describe('calendar routes', () => {
  beforeEach(() => {
    mockGetTodayEvents.mockReset();
    mockGetEvents.mockReset();
  });

  describe('GET /calendar/today', () => {
    it('returns today events from Google Calendar', async () => {
      mockGetTodayEvents.mockResolvedValue([
        {
          title: 'Team standup',
          startTime: new Date('2026-03-29T09:00:00Z'),
          endTime: new Date('2026-03-29T09:30:00Z'),
        },
        {
          title: 'Lunch with Alice',
          startTime: new Date('2026-03-29T12:00:00Z'),
          endTime: new Date('2026-03-29T13:00:00Z'),
        },
      ]);

      const res = await request(createApp()).get('/calendar/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].title).toBe('Team standup');
      expect(res.body.data[1].title).toBe('Lunch with Alice');
    });

    it('returns empty array when no events today', async () => {
      mockGetTodayEvents.mockResolvedValue([]);

      const res = await request(createApp()).get('/calendar/today');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 when calendar client throws', async () => {
      mockGetTodayEvents.mockRejectedValue(new Error('API failure'));

      const res = await request(createApp()).get('/calendar/today');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('API failure');
    });
  });

  describe('GET /calendar/week', () => {
    it('returns week events from Google Calendar', async () => {
      mockGetEvents.mockResolvedValue([
        {
          title: 'Monday meeting',
          startTime: new Date('2026-03-30T10:00:00Z'),
          endTime: new Date('2026-03-30T11:00:00Z'),
        },
      ]);

      const res = await request(createApp()).get('/calendar/week');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Monday meeting');
      expect(mockGetEvents).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('returns empty array for empty week', async () => {
      mockGetEvents.mockResolvedValue([]);

      const res = await request(createApp()).get('/calendar/week');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 500 on error', async () => {
      mockGetEvents.mockRejectedValue(new Error('API timeout'));

      const res = await request(createApp()).get('/calendar/week');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('API timeout');
    });
  });
});
