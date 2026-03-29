import { describe, it, expect, vi, afterAll } from 'vitest';
import request from 'supertest';

vi.mock('./db.js', () => ({
  query: vi.fn().mockResolvedValue([]),
  getDb: vi.fn(),
}));

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
    expect(isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });

  it('health check is NOT protected by API key middleware', async () => {
    process.env.VPS_API_SECRET = 'server-test-secret';
    const app = createApiServer();

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('CORS headers are set on responses', async () => {
    delete process.env.VPS_API_SECRET;
    const app = createApiServer();

    const res = await request(app).get('/api/health');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('OPTIONS preflight returns 204', async () => {
    delete process.env.VPS_API_SECRET;
    const app = createApiServer();

    const res = await request(app).options('/api/health');

    expect(res.status).toBe(204);
  });

  afterAll(() => {
    delete process.env.VPS_API_SECRET;
  });
});
