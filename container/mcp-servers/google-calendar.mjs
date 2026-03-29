#!/usr/bin/env node

/**
 * Google Calendar MCP Server for NanoClaw containers.
 *
 * Exposes Google Calendar operations as MCP tools so the container agent
 * can read/write calendar events. Uses googleapis with OAuth2 refresh token.
 *
 * Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN
 */

import { google } from 'googleapis';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const TIMEZONE = 'America/Edmonton';

function getCalendar() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken =
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ||
    process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_CALENDAR_REFRESH_TOKEN',
    );
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth });
}

function formatEvent(event) {
  const start = event.start?.dateTime || event.start?.date || '';
  const end = event.end?.dateTime || event.end?.date || '';
  return {
    id: event.id,
    title: event.summary || '(no title)',
    start,
    end,
    location: event.location || null,
    description: event.description || null,
  };
}

const server = new Server(
  { name: 'google-calendar', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'list_events',
      description:
        "List today's calendar events, or events in a date range. Returns events in America/Edmonton timezone.",
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description:
              'Date in YYYY-MM-DD format. Defaults to today. Lists events for this single day.',
          },
          start_date: {
            type: 'string',
            description:
              'Start date (YYYY-MM-DD) for a range query. Use with end_date.',
          },
          end_date: {
            type: 'string',
            description: 'End date (YYYY-MM-DD) for a range query.',
          },
        },
      },
    },
    {
      name: 'create_event',
      description:
        'Create a new Google Calendar event. Times in America/Edmonton timezone.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          start_time: {
            type: 'string',
            description: 'Start time as ISO 8601 datetime',
          },
          end_time: {
            type: 'string',
            description:
              'End time as ISO 8601 datetime. Defaults to start + 1 hour.',
          },
          description: { type: 'string', description: 'Event description' },
          location: { type: 'string', description: 'Event location' },
        },
        required: ['title', 'start_time'],
      },
    },
    {
      name: 'delete_event',
      description: 'Delete a calendar event by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'Google Calendar event ID' },
        },
        required: ['event_id'],
      },
    },
    {
      name: 'check_availability',
      description:
        'Check if a time slot is free on the calendar.',
      inputSchema: {
        type: 'object',
        properties: {
          start_time: {
            type: 'string',
            description: 'Start of slot (ISO 8601)',
          },
          end_time: {
            type: 'string',
            description: 'End of slot (ISO 8601)',
          },
        },
        required: ['start_time', 'end_time'],
      },
    },
  ],
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  const cal = getCalendar();

  try {
    if (name === 'list_events') {
      let timeMin, timeMax;

      if (args.start_date && args.end_date) {
        timeMin = new Date(`${args.start_date}T00:00:00`).toISOString();
        timeMax = new Date(`${args.end_date}T23:59:59`).toISOString();
      } else {
        const date = args.date || new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
        timeMin = new Date(`${date}T00:00:00`).toISOString();
        timeMax = new Date(`${date}T23:59:59`).toISOString();
      }

      const res = await cal.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: TIMEZONE,
      });

      const events = (res.data.items || []).map(formatEvent);
      return {
        content: [
          {
            type: 'text',
            text: events.length
              ? JSON.stringify(events, null, 2)
              : 'No events found for this date range.',
          },
        ],
      };
    }

    if (name === 'create_event') {
      const startTime = new Date(args.start_time);
      const endTime = args.end_time
        ? new Date(args.end_time)
        : new Date(startTime.getTime() + 60 * 60 * 1000);

      const res = await cal.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: args.title,
          description: args.description,
          location: args.location,
          start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
          end: { dateTime: endTime.toISOString(), timeZone: TIMEZONE },
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: `Event created: ${JSON.stringify(formatEvent(res.data), null, 2)}`,
          },
        ],
      };
    }

    if (name === 'delete_event') {
      await cal.events.delete({
        calendarId: 'primary',
        eventId: args.event_id,
      });
      return {
        content: [{ type: 'text', text: `Event ${args.event_id} deleted.` }],
      };
    }

    if (name === 'check_availability') {
      const res = await cal.freebusy.query({
        requestBody: {
          timeMin: new Date(args.start_time).toISOString(),
          timeMax: new Date(args.end_time).toISOString(),
          timeZone: TIMEZONE,
          items: [{ id: 'primary' }],
        },
      });

      const busy = res.data.calendars?.primary?.busy || [];
      const available = busy.length === 0;
      return {
        content: [
          {
            type: 'text',
            text: available
              ? 'That time slot is free.'
              : `Busy during: ${JSON.stringify(busy)}`,
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [
        { type: 'text', text: `Error: ${err.message}` },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
