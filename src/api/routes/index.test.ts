import { describe, it, expect, vi } from 'vitest';
import { Router } from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('../../integrations/google-calendar.js', () => ({
  GoogleCalendarClient: vi.fn(),
  CalendarEvent: undefined,
}));

import { mountRoutes } from './index.js';

describe('mountRoutes', () => {
  it('mounts all route modules on the router', () => {
    const mockUse = vi.fn();
    const router = { use: mockUse } as unknown as Router;

    mountRoutes(router);

    expect(mockUse).toHaveBeenCalledWith(
      '/health/context',
      expect.anything(),
    );
    expect(mockUse).toHaveBeenCalledWith('/health', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/meals', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/pantry', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/supplements', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/calories', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/preferences', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/reminders', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/calendar', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/bills', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/water', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/mood', expect.anything());
    expect(mockUse).toHaveBeenCalledTimes(12);
  });
});
