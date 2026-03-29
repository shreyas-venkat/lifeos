import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock googleapis before any imports that use it ---
// vi.hoisted ensures these variables are available when vi.mock factory runs (hoisted)

const {
  mockEventsList,
  mockEventsInsert,
  mockEventsDelete,
  mockEventsPatch,
  mockFreebusyQuery,
  mockSetCredentials,
  mockCalendarInstance,
} = vi.hoisted(() => {
  const mockEventsList = vi.fn();
  const mockEventsInsert = vi.fn();
  const mockEventsDelete = vi.fn();
  const mockEventsPatch = vi.fn();
  const mockFreebusyQuery = vi.fn();
  const mockSetCredentials = vi.fn();

  const mockCalendarInstance = {
    events: {
      list: mockEventsList,
      insert: mockEventsInsert,
      delete: mockEventsDelete,
      patch: mockEventsPatch,
    },
    freebusy: {
      query: mockFreebusyQuery,
    },
  };

  return {
    mockEventsList,
    mockEventsInsert,
    mockEventsDelete,
    mockEventsPatch,
    mockFreebusyQuery,
    mockSetCredentials,
    mockCalendarInstance,
  };
});

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(function (
        this: Record<string, unknown>,
      ) {
        this.setCredentials = mockSetCredentials;
      }),
    },
    calendar: vi.fn().mockReturnValue(mockCalendarInstance),
  },
}));

import {
  GoogleCalendarClient,
  getCalendarClient,
  _resetCalendarClient,
} from './google-calendar.js';

// --- Helpers ---

function setCredentialEnv() {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = 'test-refresh-token';
}

function clearCredentialEnv() {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  delete process.env.GOOGLE_REFRESH_TOKEN;
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  clearCredentialEnv();
  _resetCalendarClient();
});

afterEach(() => {
  clearCredentialEnv();
});

describe('GoogleCalendarClient constructor', () => {
  it('throws when no credentials are provided', () => {
    expect(() => new GoogleCalendarClient()).toThrow(
      'Google Calendar credentials required',
    );
  });

  it('throws when only clientId is provided', () => {
    expect(() => new GoogleCalendarClient({ clientId: 'id-only' })).toThrow(
      'Google Calendar credentials required',
    );
  });

  it('throws when refreshToken is missing', () => {
    expect(
      () =>
        new GoogleCalendarClient({
          clientId: 'id',
          clientSecret: 'secret',
        }),
    ).toThrow('Google Calendar credentials required');
  });

  it('succeeds with all three credentials via options', () => {
    const client = new GoogleCalendarClient({
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'token',
    });
    expect(client).toBeInstanceOf(GoogleCalendarClient);
    expect(mockSetCredentials).toHaveBeenCalledWith({
      refresh_token: 'token',
    });
  });

  it('succeeds with all three env vars', () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();
    expect(client).toBeInstanceOf(GoogleCalendarClient);
    expect(mockSetCredentials).toHaveBeenCalledWith({
      refresh_token: 'test-refresh-token',
    });
  });

  it('falls back to GOOGLE_REFRESH_TOKEN env var', () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'fallback-token';
    const client = new GoogleCalendarClient();
    expect(client).toBeInstanceOf(GoogleCalendarClient);
    expect(mockSetCredentials).toHaveBeenCalledWith({
      refresh_token: 'fallback-token',
    });
  });

  it('uses custom calendarId when provided', () => {
    setCredentialEnv();
    // The calendarId is stored internally; we verify it through API calls
    const client = new GoogleCalendarClient({
      calendarId: 'custom@group.calendar.google.com',
    });
    expect(client).toBeInstanceOf(GoogleCalendarClient);
  });
});

describe('getEvents', () => {
  it('returns mapped CalendarEvent array', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'evt-1',
            summary: 'Team standup',
            description: 'Daily sync',
            start: { dateTime: '2026-03-29T09:00:00-06:00' },
            end: { dateTime: '2026-03-29T09:30:00-06:00' },
            location: 'Zoom',
            eventType: 'default',
          },
          {
            id: 'evt-2',
            summary: 'Lunch',
            start: { dateTime: '2026-03-29T12:00:00-06:00' },
            end: { dateTime: '2026-03-29T13:00:00-06:00' },
          },
        ],
      },
    });

    const start = new Date('2026-03-29T00:00:00Z');
    const end = new Date('2026-03-30T00:00:00Z');
    const events = await client.getEvents(start, end);

    expect(events).toHaveLength(2);
    expect(events[0].googleEventId).toBe('evt-1');
    expect(events[0].title).toBe('Team standup');
    expect(events[0].description).toBe('Daily sync');
    expect(events[0].location).toBe('Zoom');
    expect(events[0].startTime).toBeInstanceOf(Date);
    expect(events[0].endTime).toBeInstanceOf(Date);
    expect(events[1].title).toBe('Lunch');

    expect(mockEventsList).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: 'America/Edmonton',
      }),
    );
  });

  it('returns empty array when no events', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsList.mockResolvedValueOnce({ data: { items: [] } });

    const events = await client.getEvents(
      new Date('2026-03-29T00:00:00Z'),
      new Date('2026-03-30T00:00:00Z'),
    );
    expect(events).toEqual([]);
  });

  it('handles missing items gracefully', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsList.mockResolvedValueOnce({ data: {} });

    const events = await client.getEvents(
      new Date('2026-03-29T00:00:00Z'),
      new Date('2026-03-30T00:00:00Z'),
    );
    expect(events).toEqual([]);
  });

  it('maps all-day events with date-only fields', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'allday-1',
            summary: 'Holiday',
            start: { date: '2026-03-29' },
            end: { date: '2026-03-30' },
          },
        ],
      },
    });

    const events = await client.getEvents(
      new Date('2026-03-29T00:00:00Z'),
      new Date('2026-03-30T00:00:00Z'),
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Holiday');
    expect(events[0].startTime).toBeInstanceOf(Date);
  });

  it('maps event with no summary to "(no title)"', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'no-title',
            start: { dateTime: '2026-03-29T10:00:00Z' },
            end: { dateTime: '2026-03-29T11:00:00Z' },
          },
        ],
      },
    });

    const events = await client.getEvents(
      new Date('2026-03-29T00:00:00Z'),
      new Date('2026-03-30T00:00:00Z'),
    );
    expect(events[0].title).toBe('(no title)');
  });
});

describe('getTodayEvents', () => {
  it('calls getEvents with today boundaries in Mountain Time', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsList.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'today-1',
            summary: 'Morning meeting',
            start: { dateTime: '2026-03-29T09:00:00-06:00' },
            end: { dateTime: '2026-03-29T10:00:00-06:00' },
          },
        ],
      },
    });

    const events = await client.getTodayEvents();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Morning meeting');

    // Verify that events.list was called with timeZone America/Edmonton
    expect(mockEventsList).toHaveBeenCalledWith(
      expect.objectContaining({
        timeZone: 'America/Edmonton',
        singleEvents: true,
      }),
    );
  });
});

describe('createEvent', () => {
  it('calls insert and returns event with googleEventId', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsInsert.mockResolvedValueOnce({
      data: {
        id: 'new-evt-1',
        summary: 'Dentist',
        start: { dateTime: '2026-04-01T14:00:00-06:00' },
        end: { dateTime: '2026-04-01T15:00:00-06:00' },
        location: '123 Main St',
      },
    });

    const result = await client.createEvent({
      title: 'Dentist',
      startTime: new Date('2026-04-01T20:00:00Z'),
      endTime: new Date('2026-04-01T21:00:00Z'),
      location: '123 Main St',
    });

    expect(result.googleEventId).toBe('new-evt-1');
    expect(result.title).toBe('Dentist');
    expect(result.location).toBe('123 Main St');

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        requestBody: expect.objectContaining({
          summary: 'Dentist',
          location: '123 Main St',
          start: expect.objectContaining({ timeZone: 'America/Edmonton' }),
          end: expect.objectContaining({ timeZone: 'America/Edmonton' }),
        }),
      }),
    );
  });

  it('defaults end time to 1 hour after start when not provided', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    const startTime = new Date('2026-04-01T20:00:00Z');
    const expectedEnd = new Date(startTime.getTime() + 60 * 60 * 1000);

    mockEventsInsert.mockResolvedValueOnce({
      data: {
        id: 'no-end',
        summary: 'Quick call',
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: expectedEnd.toISOString() },
      },
    });

    await client.createEvent({
      title: 'Quick call',
      startTime,
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          end: expect.objectContaining({
            dateTime: expectedEnd.toISOString(),
          }),
        }),
      }),
    );
  });
});

describe('isAvailable', () => {
  it('returns true when no conflicts', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockFreebusyQuery.mockResolvedValueOnce({
      data: {
        calendars: {
          primary: { busy: [] },
        },
      },
    });

    const available = await client.isAvailable({
      start: new Date('2026-04-01T14:00:00Z'),
      end: new Date('2026-04-01T15:00:00Z'),
    });

    expect(available).toBe(true);
    expect(mockFreebusyQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          timeZone: 'America/Edmonton',
          items: [{ id: 'primary' }],
        }),
      }),
    );
  });

  it('returns false when conflicts exist', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockFreebusyQuery.mockResolvedValueOnce({
      data: {
        calendars: {
          primary: {
            busy: [
              {
                start: '2026-04-01T14:00:00Z',
                end: '2026-04-01T14:30:00Z',
              },
            ],
          },
        },
      },
    });

    const available = await client.isAvailable({
      start: new Date('2026-04-01T14:00:00Z'),
      end: new Date('2026-04-01T15:00:00Z'),
    });

    expect(available).toBe(false);
  });

  it('returns true when calendars data is missing', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockFreebusyQuery.mockResolvedValueOnce({
      data: { calendars: {} },
    });

    const available = await client.isAvailable({
      start: new Date('2026-04-01T14:00:00Z'),
      end: new Date('2026-04-01T15:00:00Z'),
    });

    expect(available).toBe(true);
  });
});

describe('deleteEvent', () => {
  it('calls events.delete with correct params', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsDelete.mockResolvedValueOnce({});

    await client.deleteEvent('evt-to-delete');

    expect(mockEventsDelete).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'evt-to-delete',
    });
  });
});

describe('updateEvent', () => {
  it('calls events.patch with correct params', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsPatch.mockResolvedValueOnce({
      data: {
        id: 'evt-1',
        summary: 'Updated title',
        start: { dateTime: '2026-04-01T14:00:00-06:00' },
        end: { dateTime: '2026-04-01T15:00:00-06:00' },
      },
    });

    const result = await client.updateEvent('evt-1', {
      title: 'Updated title',
      description: 'New desc',
    });

    expect(result.googleEventId).toBe('evt-1');
    expect(result.title).toBe('Updated title');

    expect(mockEventsPatch).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'evt-1',
      requestBody: {
        summary: 'Updated title',
        description: 'New desc',
      },
    });
  });

  it('patches start and end times with timezone', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    const newStart = new Date('2026-04-01T20:00:00Z');
    const newEnd = new Date('2026-04-01T21:00:00Z');

    mockEventsPatch.mockResolvedValueOnce({
      data: {
        id: 'evt-2',
        summary: 'Moved meeting',
        start: { dateTime: newStart.toISOString() },
        end: { dateTime: newEnd.toISOString() },
      },
    });

    await client.updateEvent('evt-2', {
      startTime: newStart,
      endTime: newEnd,
    });

    expect(mockEventsPatch).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'evt-2',
      requestBody: {
        start: {
          dateTime: newStart.toISOString(),
          timeZone: 'America/Edmonton',
        },
        end: {
          dateTime: newEnd.toISOString(),
          timeZone: 'America/Edmonton',
        },
      },
    });
  });

  it('patches location only', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    mockEventsPatch.mockResolvedValueOnce({
      data: {
        id: 'evt-3',
        summary: 'Same title',
        start: { dateTime: '2026-04-01T14:00:00Z' },
        end: { dateTime: '2026-04-01T15:00:00Z' },
        location: 'New Office',
      },
    });

    await client.updateEvent('evt-3', { location: 'New Office' });

    expect(mockEventsPatch).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'evt-3',
      requestBody: { location: 'New Office' },
    });
  });
});

describe('getCalendarClient singleton', () => {
  it('returns the same instance on repeated calls', () => {
    setCredentialEnv();
    const a = getCalendarClient();
    const b = getCalendarClient();
    expect(a).toBe(b);
  });

  it('creates a new instance after reset', () => {
    setCredentialEnv();
    const a = getCalendarClient();
    _resetCalendarClient();
    const b = getCalendarClient();
    expect(a).not.toBe(b);
  });

  it('throws if env vars not set', () => {
    expect(() => getCalendarClient()).toThrow(
      'Google Calendar credentials required',
    );
  });
});

describe('timezone handling', () => {
  it('uses America/Edmonton in all API calls', async () => {
    setCredentialEnv();
    const client = new GoogleCalendarClient();

    // getEvents
    mockEventsList.mockResolvedValueOnce({ data: { items: [] } });
    await client.getEvents(
      new Date('2026-03-29T00:00:00Z'),
      new Date('2026-03-30T00:00:00Z'),
    );
    expect(mockEventsList).toHaveBeenCalledWith(
      expect.objectContaining({ timeZone: 'America/Edmonton' }),
    );

    // createEvent
    mockEventsInsert.mockResolvedValueOnce({
      data: {
        id: 'tz-test',
        summary: 'TZ test',
        start: { dateTime: '2026-03-29T10:00:00-06:00' },
        end: { dateTime: '2026-03-29T11:00:00-06:00' },
      },
    });
    await client.createEvent({
      title: 'TZ test',
      startTime: new Date('2026-03-29T16:00:00Z'),
    });
    const insertCall = mockEventsInsert.mock.calls[0][0];
    expect(insertCall.requestBody.start.timeZone).toBe('America/Edmonton');
    expect(insertCall.requestBody.end.timeZone).toBe('America/Edmonton');

    // isAvailable
    mockFreebusyQuery.mockResolvedValueOnce({
      data: { calendars: { primary: { busy: [] } } },
    });
    await client.isAvailable({
      start: new Date('2026-03-29T14:00:00Z'),
      end: new Date('2026-03-29T15:00:00Z'),
    });
    expect(mockFreebusyQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          timeZone: 'America/Edmonton',
        }),
      }),
    );
  });

  it('uses custom calendarId in API calls', async () => {
    setCredentialEnv();
    const customId = 'work@group.calendar.google.com';
    const client = new GoogleCalendarClient({ calendarId: customId });

    mockEventsList.mockResolvedValueOnce({ data: { items: [] } });
    await client.getEvents(
      new Date('2026-03-29T00:00:00Z'),
      new Date('2026-03-30T00:00:00Z'),
    );
    expect(mockEventsList).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: customId }),
    );

    mockFreebusyQuery.mockResolvedValueOnce({
      data: { calendars: { [customId]: { busy: [] } } },
    });
    const available = await client.isAvailable({
      start: new Date('2026-03-29T14:00:00Z'),
      end: new Date('2026-03-29T15:00:00Z'),
    });
    expect(available).toBe(true);
    expect(mockFreebusyQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          items: [{ id: customId }],
        }),
      }),
    );
  });
});
