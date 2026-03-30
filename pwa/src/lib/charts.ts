import type { ChartOptions } from 'chart.js';

export const defaultOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    tooltip: {
      backgroundColor: '#1a1a24',
      titleColor: '#e8e8ed',
      bodyColor: '#8888a0',
      borderColor: '#2a2a3a',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12,
      displayColors: true,
    },
    legend: {
      display: true,
      labels: {
        color: '#8888a0',
        usePointStyle: true,
        pointStyle: 'circle',
        padding: 16,
        font: { size: 11 },
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#8888a0', font: { size: 10 } },
      border: { display: false },
    },
    y: {
      grid: { color: '#2a2a3a20' },
      ticks: { color: '#8888a0', font: { size: 10 } },
      border: { display: false },
    },
  },
  elements: {
    line: {
      tension: 0.4,
      borderWidth: 2,
    },
    point: {
      radius: 0,
      hoverRadius: 6,
      hitRadius: 20,
    },
  },
};

export function createGradient(
  ctx: CanvasRenderingContext2D,
  color: string,
  height: number,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(1, color + '00');
  return gradient;
}

export const colors = {
  steps: '#6366f1',
  heart_rate: '#ef4444',
  sleep: '#a855f7',
  weight: '#3b82f6',
  calories: '#f59e0b',
  protein: '#22c55e',
  mood: '#ec4899',
  water: '#06b6d4',
} as const;

/**
 * Deep-merge default line chart options with overrides.
 * Only handles plain objects and arrays (no class instances).
 */
export function mergeOptions(
  overrides: ChartOptions<'line'>,
): ChartOptions<'line'> {
  return deepMerge(defaultOptions, overrides) as ChartOptions<'line'>;
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const bVal = base[key];
    const pVal = patch[key];
    if (
      bVal &&
      pVal &&
      typeof bVal === 'object' &&
      typeof pVal === 'object' &&
      !Array.isArray(bVal) &&
      !Array.isArray(pVal)
    ) {
      result[key] = deepMerge(
        bVal as Record<string, unknown>,
        pVal as Record<string, unknown>,
      );
    } else {
      result[key] = pVal;
    }
  }
  return result;
}
