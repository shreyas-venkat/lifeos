import { describe, it, expect, vi } from 'vitest';
import { Router } from 'express';
import { mountRoutes } from './index.js';

describe('mountRoutes', () => {
  it('mounts no routes (all routes in server.ts now)', () => {
    const mockUse = vi.fn();
    const router = { use: mockUse } as unknown as Router;

    mountRoutes(router);

    expect(mockUse).not.toHaveBeenCalled();
  });
});
