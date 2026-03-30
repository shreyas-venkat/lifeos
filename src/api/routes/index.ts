import { Router } from 'express';
import { healthContextRouter } from './health-context.js';
import { healthRouter } from './health.js';
import { mealsRouter } from './meals.js';
import { pantryRouter } from './pantry.js';
import { supplementsRouter } from './supplements.js';
import { caloriesRouter } from './calories.js';
import { preferencesRouter } from './preferences.js';
import { habitsRouter } from './habits.js';
import { photoEstimateRouter } from './photo-estimate.js';

export function mountRoutes(router: Router): void {
  router.use('/health/context', healthContextRouter);
  router.use('/health', healthRouter);
  router.use('/meals', mealsRouter);
  router.use('/pantry', pantryRouter);
  router.use('/supplements', supplementsRouter);
  router.use('/calories', caloriesRouter);
  router.use('/calories', photoEstimateRouter);
  router.use('/preferences', preferencesRouter);
  router.use('/habits', habitsRouter);
}
