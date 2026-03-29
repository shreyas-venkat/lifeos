<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { HealthMetric, HealthHistoryPoint } from '$lib/api';
	import Chart from 'chart.js/auto';

	let todayMetrics = $state<HealthMetric[]>([]);
	let history = $state<HealthHistoryPoint[]>([]);
	let loading = $state(true);
	let selectedDays = $state(7);
	let chartCanvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance: Chart | null = null;

	const metricConfig: Record<string, { label: string; unit: string; color: string }> = {
		steps: { label: 'Steps', unit: '', color: '#6366f1' },
		heart_rate: { label: 'HR', unit: 'bpm', color: '#ef4444' },
		hrv: { label: 'HRV', unit: 'ms', color: '#8b5cf6' },
		spo2: { label: 'SpO2', unit: '%', color: '#06b6d4' },
		weight: { label: 'Weight', unit: 'kg', color: '#f59e0b' },
		sleep_hours: { label: 'Sleep', unit: 'h', color: '#22c55e' },
	};

	const metricTypes = Object.keys(metricConfig);

	function getLatestMetric(type: string): HealthMetric | undefined {
		return todayMetrics.find((m) => m.metric_type === type);
	}

	function formatValue(metric: HealthMetric | undefined): string {
		if (!metric) return '--';
		if (metric.metric_type === 'steps') return Math.round(metric.value).toLocaleString();
		if (metric.metric_type === 'sleep_hours') return metric.value.toFixed(1);
		return String(Math.round(metric.value));
	}

	async function loadHistory(days: number) {
		selectedDays = days;
		history = await api.health.history(days);
		renderChart();
	}

	function renderChart() {
		if (!chartCanvas || history.length === 0) return;
		if (chartInstance) chartInstance.destroy();

		// Group history by metric_type
		const grouped: Record<string, HealthHistoryPoint[]> = {};
		for (const point of history) {
			if (!grouped[point.metric_type]) grouped[point.metric_type] = [];
			grouped[point.metric_type].push(point);
		}

		// Build datasets for chart metrics (steps, heart_rate, sleep_hours)
		const chartMetrics = ['steps', 'heart_rate', 'sleep_hours'];
		const allDates = [...new Set(history.map((p) => p.date))].sort();

		const datasets = chartMetrics
			.filter((m) => grouped[m])
			.map((m) => {
				const config = metricConfig[m];
				const points = grouped[m];
				const dateMap = new Map(points.map((p) => [p.date, p.avg_value]));

				return {
					label: config.label,
					data: allDates.map((d) => dateMap.get(d) ?? null),
					borderColor: config.color,
					backgroundColor: config.color + '20',
					fill: true,
					tension: 0.4,
					pointRadius: 2,
					pointHoverRadius: 5,
					yAxisID: m === 'steps' ? 'y' : 'y1',
				};
			});

		chartInstance = new Chart(chartCanvas, {
			type: 'line',
			data: {
				labels: allDates.map((d) => d.slice(5)),
				datasets,
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index', intersect: false },
				plugins: {
					legend: {
						labels: {
							color: '#8888a0',
							font: { family: 'Inter', size: 11 },
							usePointStyle: true,
							pointStyle: 'circle',
						},
					},
				},
				scales: {
					x: {
						ticks: { color: '#8888a0', font: { family: 'Inter', size: 10 } },
						grid: { display: false },
					},
					y: {
						position: 'left',
						ticks: { color: '#8888a0', font: { family: 'Inter', size: 10 } },
						grid: { color: '#2a2a3a' },
					},
					y1: {
						position: 'right',
						ticks: { color: '#8888a0', font: { family: 'Inter', size: 10 } },
						grid: { display: false },
					},
				},
			},
		});
	}

	onMount(async () => {
		const [t, h] = await Promise.allSettled([
			api.health.today(),
			api.health.history(selectedDays),
		]);
		if (t.status === 'fulfilled') todayMetrics = t.value;
		if (h.status === 'fulfilled') history = h.value;
		loading = false;
		requestAnimationFrame(() => renderChart());
	});
</script>

<svelte:head>
	<title>Health - LifeOS</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<h1>Health</h1>
		<div class="toggle-pills">
			<button class:active={selectedDays === 7} onclick={() => loadHistory(7)}>7D</button>
			<button class:active={selectedDays === 30} onclick={() => loadHistory(30)}>30D</button>
			<button class:active={selectedDays === 90} onclick={() => loadHistory(90)}>90D</button>
		</div>
	</div>

	{#if loading}
		<div class="vitals-grid">
			{#each Array(6) as _}
				<div class="skeleton" style="height: 80px;"></div>
			{/each}
		</div>
	{:else if todayMetrics.length === 0 && history.length === 0}
		<div class="empty-state fade-in">
			<p>No health data yet.</p>
			<p class="empty-hint">Connect Health Connect on your phone to start tracking.</p>
		</div>
	{:else}
		<div class="vitals-grid fade-in">
			{#each metricTypes as type}
				{@const metric = getLatestMetric(type)}
				{@const config = metricConfig[type]}
				<div class="vital-card">
					<span class="vital-label">{config.label}</span>
					<span class="vital-value" class:muted={!metric}>
						{formatValue(metric)}
					</span>
					{#if metric && config.unit}
						<span class="vital-unit">{config.unit}</span>
					{/if}
				</div>
			{/each}
		</div>

		{#if history.length > 0}
			<div class="chart-section fade-in">
				<h2>Trends</h2>
				<div class="chart-wrapper">
					<canvas bind:this={chartCanvas}></canvas>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 600;
	}

	.toggle-pills {
		display: flex;
		gap: 4px;
		background: var(--bg-card);
		border-radius: 10px;
		padding: 3px;
	}

	.toggle-pills button {
		background: none;
		border: none;
		color: var(--text-secondary);
		padding: 6px 14px;
		border-radius: 8px;
		font-size: 0.8rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.toggle-pills button.active {
		background: var(--accent);
		color: var(--text-primary);
	}

	.vitals-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin-bottom: 1.5rem;
	}

	@media (max-width: 400px) {
		.vitals-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.vital-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		border: 1px solid var(--border);
		transition: border-color 0.2s;
	}

	.vital-card:hover {
		border-color: var(--accent);
	}

	.vital-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 500;
	}

	.vital-value {
		font-size: 1.35rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}

	.vital-value.muted {
		color: var(--text-secondary);
		font-weight: 400;
	}

	.vital-unit {
		font-size: 0.7rem;
		color: var(--text-secondary);
	}

	.chart-section {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 1rem;
		border: 1px solid var(--border);
	}

	.chart-section h2 {
		font-size: 0.8rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.75rem;
		font-weight: 500;
	}

	.chart-wrapper {
		height: 220px;
		position: relative;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--text-secondary);
	}

	.empty-hint {
		font-size: 0.85rem;
		margin-top: 0.5rem;
		opacity: 0.7;
	}
</style>
