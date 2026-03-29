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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

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

const server = new McpServer({
  name: 'google-calendar',
  version: '1.0.0',
});

server.tool(
  'list_events',
  "List today's calendar events, or events for a specific date or date range (America/Edmonton timezone)",
  {
    date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.'),
    start_date: z.string().optional().describe('Start date (YYYY-MM-DD) for a range query.'),
    end_date: z.string().optional().describe('End date (YYYY-MM-DD) for a range query.'),
  },
  async ({ date, start_date, end_date }) => {
    try {
      const cal = getCalendar();
      let timeMin, timeMax;

      if (start_date && end_date) {
        timeMin = new Date(`${start_date}T00:00:00`).toISOString();
        timeMax = new Date(`${end_date}T23:59:59`).toISOString();
      } else {
        const d = date || new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
        timeMin = new Date(`${d}T00:00:00`).toISOString();
        timeMax = new Date(`${d}T23:59:59`).toISOString();
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
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  'create_event',
  'Create a new Google Calendar event (America/Edmonton timezone)',
  {
    title: z.string().describe('Event title'),
    start_time: z.string().describe('Start time as ISO 8601 datetime'),
    end_time: z.string().optional().describe('End time. Defaults to start + 1 hour.'),
    description: z.string().optional().describe('Event description'),
    location: z.string().optional().describe('Event location'),
  },
  async ({ title, start_time, end_time, description, location }) => {
    try {
      const cal = getCalendar();
      const startTime = new Date(start_time);
      const endTime = end_time
        ? new Date(end_time)
        : new Date(startTime.getTime() + 60 * 60 * 1000);

      const res = await cal.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: title,
          description,
          location,
          start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
          end: { dateTime: endTime.toISOString(), timeZone: TIMEZONE },
        },
      });

      return {
        content: [{ type: 'text', text: `Event created: ${JSON.stringify(formatEvent(res.data), null, 2)}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  'delete_event',
  'Delete a calendar event by ID',
  {
    event_id: z.string().describe('Google Calendar event ID'),
  },
  async ({ event_id }) => {
    try {
      const cal = getCalendar();
      await cal.events.delete({ calendarId: 'primary', eventId: event_id });
      return { content: [{ type: 'text', text: `Event ${event_id} deleted.` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  'check_availability',
  'Check if a time slot is free on the calendar',
  {
    start_time: z.string().describe('Start of slot (ISO 8601)'),
    end_time: z.string().describe('End of slot (ISO 8601)'),
  },
  async ({ start_time, end_time }) => {
    try {
      const cal = getCalendar();
      const res = await cal.freebusy.query({
        requestBody: {
          timeMin: new Date(start_time).toISOString(),
          timeMax: new Date(end_time).toISOString(),
          timeZone: TIMEZONE,
          items: [{ id: 'primary' }],
        },
      });

      const busy = res.data.calendars?.primary?.busy || [];
      return {
        content: [{
          type: 'text',
          text: busy.length === 0
            ? 'That time slot is free.'
            : `Busy during: ${JSON.stringify(busy)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
