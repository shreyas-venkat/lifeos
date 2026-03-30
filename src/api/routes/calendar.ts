import { Router, Request, Response } from 'express';
import {
  GoogleCalendarClient,
  CalendarEvent,
} from '../../integrations/google-calendar.js';

export const calendarRouter = Router();

function getClient(): GoogleCalendarClient {
  return new GoogleCalendarClient();
}

calendarRouter.get('/today', async (_req: Request, res: Response) => {
  try {
    const client = getClient();
    const events: CalendarEvent[] = await client.getTodayEvents();
    res.json({ data: events });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

calendarRouter.get('/week', async (_req: Request, res: Response) => {
  try {
    const client = getClient();
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events: CalendarEvent[] = await client.getEvents(now, weekFromNow);
    res.json({ data: events });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
