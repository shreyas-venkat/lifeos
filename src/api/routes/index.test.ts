import { describe, it, expect, vi } from 'vitest';
import { Router } from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  getDb: vi.fn(),
}));

import { mountRoutes } from './index.js';

describe('mountRoutes', () => {
  it('mounts all route modules on the router', () => {
    const mockUse = vi.fn();
    const router = { use: mockUse } as unknown as Router;

    mountRoutes(router);

    expect(mockUse).toHaveBeenCalledWith('/health/context', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/health', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/meals', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/pantry', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/supplements', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/calories', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/preferences', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/spending', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/notifications', expect.anything());
    expect(mockUse).toHaveBeenCalledWith('/usage', expect.anything());
    expect(mockUse).toHaveBeenCalledTimes(10);
  });
});
