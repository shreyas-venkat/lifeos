import { describe, it, expect, vi } from 'vitest';
import { Router } from 'express';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  getDb: vi.fn(),
}));

import { mountRoutes } from './index.js';

describe('mountRoutes', () => {
  it('mounts only calendar route after WASM migration', () => {
    const mockUse = vi.fn();
    const router = { use: mockUse } as unknown as Router;

    mountRoutes(router);

    expect(mockUse).toHaveBeenCalledWith('/calendar', expect.anything());
    expect(mockUse).toHaveBeenCalledTimes(1);
  });
});
