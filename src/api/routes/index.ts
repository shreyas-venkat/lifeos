import { Router } from 'express';
import { healthContextRouter } from './health-context.js';
import { healthRouter } from './health.js';
import { mealsRouter } from './meals.js';
import { pantryRouter } from './pantry.js';
import { supplementsRouter } from './supplements.js';
import { caloriesRouter } from './calories.js';
import { preferencesRouter } from './preferences.js';
import { remindersRouter } from './reminders.js';
import { calendarRouter } from './calendar.js';
import { billsRouter } from './bills.js';
import { waterRouter } from './water.js';
import { moodRouter } from './mood.js';

export function mountRoutes(router: Router): void {
  router.use('/health/context', healthContextRouter);
  router.use('/health', healthRouter);
  router.use('/meals', mealsRouter);
  router.use('/pantry', pantryRouter);
  router.use('/supplements', supplementsRouter);
  router.use('/calories', caloriesRouter);
  router.use('/preferences', preferencesRouter);
  router.use('/reminders', remindersRouter);
  router.use('/calendar', calendarRouter);
  router.use('/bills', billsRouter);
  router.use('/water', waterRouter);
  router.use('/mood', moodRouter);
}
