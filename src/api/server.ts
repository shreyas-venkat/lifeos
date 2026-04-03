import express from 'express';
import rateLimit from 'express-rate-limit';
import { healthWebhookRouter } from './routes/health-webhook.js';
import { logger } from '../logger.js';

// Global BigInt serialization support — DuckDB returns BigInt for many numeric types
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
(BigInt.prototype as BigInt & { toJSON?: () => number }).toJSON = function () {
  return Number(this);
};

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
});

export function createApiServer(_port = 3100): express.Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ limit: '1mb', type: 'text/*' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // CORS — restrict to Tailscale and localhost origins
  app.use((_req, res, next) => {
    const origin = _req.headers.origin;
    const allowed =
      !origin ||
      origin.includes('.ts.net') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1');
    if (allowed) {
      res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // API key auth on health webhook — header only (not query param)
  app.use(
    '/api/health-webhook',
    webhookLimiter,
    (req, res, next) => {
      const apiKey = req.headers['x-api-key'];
      const expectedKey = process.env.VPS_API_SECRET;
      if (expectedKey && apiKey !== expectedKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    },
    healthWebhookRouter,
  );

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
