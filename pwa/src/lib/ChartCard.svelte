<script lang="ts">
  import { onDestroy } from 'svelte';
  import Chart from 'chart.js/auto';
  import type { ChartType, ChartData, ChartOptions } from 'chart.js';
  import { defaultOptions, mergeOptions } from '$lib/charts';

  interface Props {
    type?: ChartType;
    data: ChartData;
    options?: ChartOptions<'line'>;
    height?: number;
    emptyMessage?: string;
  }

  let {
    type = 'line',
    data,
    options = {},
    height = 200,
    emptyMessage = 'No data for this period',
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart | null = null;

  /** True when data has at least one dataset with at least one non-null value */
  const hasData = $derived(() => {
    if (!data || !data.datasets || data.datasets.length === 0) return false;
    return data.datasets.some(
      (ds) => ds.data && ds.data.length > 0 && ds.data.some((v) => v !== null && v !== undefined),
    );
  });

  function createChart() {
    if (!canvas) return;
    if (chart) {
      chart.destroy();
      chart = null;
    }
    if (!hasData()) return;

    const merged =
      type === 'line'
        ? mergeOptions(options as ChartOptions<'line'>)
        : options;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart = new Chart(canvas, { type, data, options: merged as any });
  }

  $effect(() => {
    // Re-run whenever data, options, or canvas ref changes
    void data;
    void options;
    if (canvas) {
      createChart();
    }
    return () => {
      if (chart) {
        chart.destroy();
        chart = null;
      }
    };
  });

  onDestroy(() => {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  });
</script>

<div class="chart-card" style="height: {height}px;">
  {#if hasData()}
    <canvas bind:this={canvas}></canvas>
  {:else}
    <div class="chart-empty">
      <p>{emptyMessage}</p>
    </div>
  {/if}
</div>

<style>
  .chart-card {
    position: relative;
    width: 100%;
  }

  .chart-card canvas {
    width: 100% !important;
    height: 100% !important;
  }

  .chart-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
</style>
