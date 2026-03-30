import { Router } from 'express';
import { healthContextRouter } from './health-context.js';
import { healthRouter } from './health.js';
import { mealsRouter } from './meals.js';
import { pantryRouter } from './pantry.js';
import { supplementsRouter } from './supplements.js';
import { caloriesRouter } from './calories.js';
import { preferencesRouter } from './preferences.js';
import { streaksRouter } from './streaks.js';
import { exportRouter } from './export.js';
import { weeklyReportRouter } from './weekly-report.js';

export function mountRoutes(router: Router): void {
  router.use('/health/context', healthContextRouter);
  router.use('/health', healthRouter);
  router.use('/meals', mealsRouter);
  router.use('/pantry', pantryRouter);
  router.use('/supplements', supplementsRouter);
  router.use('/calories', caloriesRouter);
  router.use('/preferences', preferencesRouter);
  router.use('/streaks', streaksRouter);
  router.use('/export', exportRouter);
  router.use('/weekly-report', weeklyReportRouter);
}
