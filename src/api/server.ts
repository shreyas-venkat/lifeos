import express from 'express';
import { healthWebhookRouter } from './routes/health-webhook.js';
import { mountRoutes } from './routes/index.js';
import { logger } from '../logger.js';

export function createApiServer(_port = 3100): express.Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  // CORS for PWA
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // API key auth middleware
  app.use('/api', (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.key;
    const expectedKey = process.env.VPS_API_SECRET;
    if (expectedKey && apiKey !== expectedKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  app.use('/api/health-webhook', healthWebhookRouter);

  // Mount Phase 4 data routes
  const apiRouter = express.Router();
  mountRoutes(apiRouter);
  app.use('/api', apiRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}

export function startApiServer(port = 3100): void {
  const app = createApiServer(port);
  app.listen(port, () => {
    logger.info({ port }, 'API server listening');
  });
}
