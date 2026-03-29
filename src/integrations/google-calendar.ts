import { google, calendar_v3 } from 'googleapis';

const TIMEZONE = 'America/Edmonton';

export interface CalendarEvent {
  id?: string;
  googleEventId?: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  location?: string;
  eventType?: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

function mapGoogleEvent(event: calendar_v3.Schema$Event): CalendarEvent {
  return {
    googleEventId: event.id ?? undefined,
    title: event.summary ?? '(no title)',
    description: event.description ?? undefined,
    startTime: new Date(
      event.start?.dateTime ?? event.start?.date ?? Date.now(),
    ),
    endTime: event.end?.dateTime
      ? new Date(event.end.dateTime)
      : event.end?.date
        ? new Date(event.end.date)
        : undefined,
    location: event.location ?? undefined,
    eventType: event.eventType ?? undefined,
  };
}

function toGoogleDateTime(date: Date): string {
  return date.toISOString();
}

export class GoogleCalendarClient {
  private calendar: calendar_v3.Calendar;
  private calendarId: string;

  constructor(options?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    calendarId?: string;
  }) {
    const clientId = options?.clientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret =
      options?.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken =
      options?.refreshToken ||
      process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ||
      process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Google Calendar credentials required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN',
      );
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });

    this.calendar = google.calendar({ version: 'v3', auth });
    this.calendarId = options?.calendarId || 'primary';
  }

  async getTodayEvents(): Promise<CalendarEvent[]> {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    // Get today's date parts in Mountain Time
    const parts = formatter.formatToParts(now);
    const year = Number(parts.find((p) => p.type === 'year')!.value);
    const month = Number(parts.find((p) => p.type === 'month')!.value) - 1;
    const day = Number(parts.find((p) => p.type === 'day')!.value);

    // Compute the Mountain Time UTC offset, then derive start/end of day in UTC
    const mtnOffset = getTimezoneOffsetMs(TIMEZONE, now);
    const timeMin = new Date(Date.UTC(year, month, day) - mtnOffset);
    const timeMax = new Date(timeMin.getTime() + 24 * 60 * 60 * 1000);

    return this.getEvents(timeMin, timeMax);
  }

  async getEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    const response = await this.calendar.events.list({
      calendarId: this.calendarId,
      timeMin: toGoogleDateTime(startDate),
      timeMax: toGoogleDateTime(endDate),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TIMEZONE,
    });

    const events = response.data.items ?? [];
    return events.map(mapGoogleEvent);
  }

  async createEvent(event: CalendarEvent): Promise<CalendarEvent> {
    const response = await this.calendar.events.insert({
      calendarId: this.calendarId,
      requestBody: {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: {
          dateTime: toGoogleDateTime(event.startTime),
          timeZone: TIMEZONE,
        },
        end: {
          dateTime: event.endTime
            ? toGoogleDateTime(event.endTime)
            : toGoogleDateTime(
                new Date(event.startTime.getTime() + 60 * 60 * 1000),
              ),
          timeZone: TIMEZONE,
        },
      },
    });

    return mapGoogleEvent(response.data);
  }

  async isAvailable(slot: TimeSlot): Promise<boolean> {
    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: toGoogleDateTime(slot.start),
        timeMax: toGoogleDateTime(slot.end),
        timeZone: TIMEZONE,
        items: [{ id: this.calendarId }],
      },
    });

    const busy = response.data.calendars?.[this.calendarId]?.busy ?? [];
    return busy.length === 0;
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId: this.calendarId,
      eventId,
    });
  }

  async updateEvent(
    eventId: string,
    updates: Partial<CalendarEvent>,
  ): Promise<CalendarEvent> {
    const requestBody: calendar_v3.Schema$Event = {};

    if (updates.title !== undefined) {
      requestBody.summary = updates.title;
    }
    if (updates.description !== undefined) {
      requestBody.description = updates.description;
    }
    if (updates.location !== undefined) {
      requestBody.location = updates.location;
    }
    if (updates.startTime !== undefined) {
      requestBody.start = {
        dateTime: toGoogleDateTime(updates.startTime),
        timeZone: TIMEZONE,
      };
    }
    if (updates.endTime !== undefined) {
      requestBody.end = {
        dateTime: toGoogleDateTime(updates.endTime),
        timeZone: TIMEZONE,
      };
    }

    const response = await this.calendar.events.patch({
      calendarId: this.calendarId,
      eventId,
      requestBody,
    });

    return mapGoogleEvent(response.data);
  }
}

function getTimezoneOffsetMs(timezone: string, date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = date.toLocaleString('en-US', { timeZone: timezone });
  return new Date(utcStr).getTime() - new Date(localStr).getTime();
}

let client: GoogleCalendarClient | null = null;

export function getCalendarClient(): GoogleCalendarClient {
  if (!client) {
    client = new GoogleCalendarClient();
  }
  return client;
}

export function _resetCalendarClient(): void {
  client = null;
}
