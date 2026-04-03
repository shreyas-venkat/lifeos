import { Router } from 'express';
import { calendarRouter } from './calendar.js';

// Post-WASM migration: only calendar needs Express (server-side Google OAuth).
// All other data routes are now handled by direct MotherDuck WASM queries in the PWA.
// health-webhook is mounted separately in server.ts with its own auth + rate limiting.

export function mountRoutes(router: Router): void {
  router.use('/calendar', calendarRouter);
}
