import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApiServer } from './server.js';

describe('createApiServer', () => {
  it('returns an Express app', () => {
    delete process.env.VPS_API_SECRET;
    const app = createApiServer();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });

  it('health check endpoint returns ok', async () => {
    delete process.env.VPS_API_SECRET;
    const app = createApiServer();

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    // Timestamp should be a valid ISO string
    expect(isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });

  it('health check is protected by API key middleware', async () => {
    process.env.VPS_API_SECRET = 'server-test-secret';
    const app = createApiServer();

    const resNoKey = await request(app).get('/api/health');
    expect(resNoKey.status).toBe(401);

    const resWithKey = await request(app)
      .get('/api/health')
      .set('x-api-key', 'server-test-secret');
    expect(resWithKey.status).toBe(200);
    expect(resWithKey.body.status).toBe('ok');
  });

  afterAll(() => {
    delete process.env.VPS_API_SECRET;
  });
});
