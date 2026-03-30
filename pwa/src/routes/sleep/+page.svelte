<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api';
	import type { SleepMetric, SleepHistoryPoint, SleepInsight } from '$lib/api';
	import Chart from 'chart.js/auto';

	let latest = $state<SleepMetric[]>([]);
	let history = $state<SleepHistoryPoint[]>([]);
	let insights = $state<SleepInsight[]>([]);
	let loading = $state(true);
	let selectedDays = $state(30);

	// Chart refs
	let durationCanvas = $state<HTMLCanvasElement | null>(null);
	let durationChart: Chart | null = null;

	// Derived: last night's sleep
	const lastDuration = $derived(latest.find((m) => m.metric_type === 'sleep_duration'));
	const lastQuality = $derived(latest.find((m) => m.metric_type === 'sleep_quality'));

	function formatDuration(hours: number): string {
		const h = Math.floor(hours);
		const m = Math.round((hours - h) * 60);
		return `${h}h ${m.toString().padStart(2, '0')}m`;
	}

	function qualityColor(score: number): string {
		if (score >= 75) return '#22c55e';
		if (score >= 50) return '#f59e0b';
		return '#ef4444';
	}

	function qualityGradient(score: number): string {
		const pct = Math.min(100, Math.max(0, score));
		return `linear-gradient(90deg, #ef4444 0%, #f59e0b 40%, #22c55e 75%, #22c55e 100%) 0 0 / ${pct}% 100% no-repeat`;
	}

	// Compute weekly average from history
	const weeklyAvg = $derived.by(() => {
		const durationPoints = history.filter((p) => p.metric_type === 'sleep_duration');
		if (durationPoints.length === 0) return null;
		// Last 7 entries
		const recent = durationPoints.slice(-7);
		const sum = recent.reduce((a, b) => a + b.value, 0);
		return sum / recent.length;
	});

	const nightsOnTarget = $derived.by(() => {
		const durationPoints = history.filter((p) => p.metric_type === 'sleep_duration');
		const recent = durationPoints.slice(-7);
		return recent.filter((p) => p.value >= 7 && p.value <= 9).length;
	});

	function renderCharts() {
		if (!durationCanvas || history.length === 0) return;
		if (durationChart) durationChart.destroy();

		const durationPoints = history.filter((p) => p.metric_type === 'sleep_duration');
		const qualityPoints = history.filter((p) => p.metric_type === 'sleep_quality');
		const dates = [...new Set(durationPoints.map((p) => p.date))].sort();
		const durMap = new Map(durationPoints.map((p) => [p.date, p.value]));
		const qualMap = new Map(qualityPoints.map((p) => [p.date, p.value]));

		// Average duration for the dashed line
		const durValues = dates.map((d) => durMap.get(d) ?? null).filter((v): v is number => v !== null);
		const avgDuration = durValues.length > 0 ? durValues.reduce((a, b) => a + b, 0) / durValues.length : 0;

		const ctx = durationCanvas.getContext('2d');
		if (!ctx) return;

		const barGradient = ctx.createLinearGradient(0, 0, 0, durationCanvas.height);
		barGradient.addColorStop(0, '#7c3aed');
		barGradient.addColorStop(1, '#312e81');

		durationChart = new Chart(durationCanvas, {
			type: 'bar',
			data: {
				labels: dates.map((d) => d.slice(5)),
				datasets: [
					{
						type: 'bar',
						label: 'Duration (h)',
						data: dates.map((d) => durMap.get(d) ?? null),
						backgroundColor: barGradient,
						borderRadius: 4,
						borderSkipped: false,
						barPercentage: 0.7,
						yAxisID: 'y',
						order: 2,
					},
					{
						type: 'line',
						label: 'Quality',
						data: dates.map((d) => qualMap.get(d) ?? null),
						borderColor: '#a78bfa',
						backgroundColor: 'transparent',
						tension: 0.4,
						pointRadius: 2,
						pointHoverRadius: 5,
						pointBackgroundColor: '#a78bfa',
						borderWidth: 2,
						yAxisID: 'y1',
						order: 1,
					},
					{
						type: 'line',
						label: `Avg (${avgDuration.toFixed(1)}h)`,
						data: dates.map(() => avgDuration),
						borderColor: '#6366f180',
						borderDash: [6, 4],
						borderWidth: 1.5,
						pointRadius: 0,
						pointHoverRadius: 0,
						fill: false,
						yAxisID: 'y',
						order: 0,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					mode: 'index',
					intersect: false,
				},
				plugins: {
					legend: {
						labels: {
							color: '#8888a0',
							font: { family: 'Inter', size: 11 },
							usePointStyle: true,
							pointStyle: 'circle',
						},
					},
					tooltip: {
						backgroundColor: '#1a1a24',
						titleColor: '#e8e8ed',
						bodyColor: '#e8e8ed',
						borderColor: '#7c3aed',
						borderWidth: 1,
						padding: 10,
						cornerRadius: 8,
						callbacks: {
							label: (context) => {
								if (context.dataset.label?.startsWith('Avg')) return '';
								const y = context.parsed.y ?? 0;
								if (context.dataset.yAxisID === 'y1') {
									return `Quality: ${Math.round(y)}/100`;
								}
								return `Duration: ${y.toFixed(1)}h`;
							},
						},
					},
				},
				scales: {
					x: {
						ticks: { color: '#8888a0', font: { family: 'Inter', size: 10 }, maxRotation: 45 },
						grid: { display: false },
						border: { display: false },
					},
					y: {
						position: 'left',
						min: 0,
						max: 12,
						ticks: {
							color: '#8888a0',
							font: { family: 'Inter', size: 10 },
							callback: (v) => `${v}h`,
						},
						grid: { color: '#2a2a3a20' },
						border: { display: false },
					},
					y1: {
						position: 'right',
						min: 0,
						max: 100,
						ticks: {
							color: '#8888a0',
							font: { family: 'Inter', size: 10 },
						},
						grid: { display: false },
						border: { display: false },
					},
				},
			},
		});
	}

	async function selectPeriod(days: number) {
		selectedDays = days;
		history = await api.sleep.history(days);
		requestAnimationFrame(() => renderCharts());
	}

	function insightBorderColor(type: string): string {
		if (type === 'positive') return '#22c55e';
		if (type === 'negative') return '#ef4444';
		return '#8888a0';
	}

	onMount(async () => {
		const [latestRes, historyRes, insightsRes] = await Promise.allSettled([
			api.sleep.latest(),
			api.sleep.history(selectedDays),
			api.sleep.insights(),
		]);
		if (latestRes.status === 'fulfilled') latest = latestRes.value;
		if (historyRes.status === 'fulfilled') history = historyRes.value;
		if (insightsRes.status === 'fulfilled') insights = insightsRes.value;
		loading = false;
		requestAnimationFrame(() => renderCharts());
	});

	onDestroy(() => {
		if (durationChart) durationChart.destroy();
	});
</script>

<svelte:head>
	<title>Sleep - LifeOS</title>
</svelte:head>

<div class="page sleep-page">
	<div class="page-header">
		<div class="header-row">
			<a href="/health" class="back-link" aria-label="Back to Health">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
					<path d="M15 18l-6-6 6-6" />
				</svg>
			</a>
			<h1>Sleep</h1>
		</div>
	</div>

	{#if loading}
		<div class="skeleton-group">
			<div class="skeleton" style="height: 140px;"></div>
			<div class="skeleton" style="height: 260px;"></div>
			<div class="skeleton" style="height: 100px;"></div>
		</div>
	{:else}
		<!-- Last Night's Sleep -->
		{#if lastDuration || lastQuality}
			<div class="last-night-card fade-in">
				<span class="card-label">Last Night</span>
				<div class="last-night-main">
					{#if lastDuration}
						<span class="duration-large">{formatDuration(lastDuration.value)}</span>
					{/if}
					{#if lastQuality}
						<span class="quality-badge" style="color: {qualityColor(lastQuality.value)}">
							{Math.round(lastQuality.value)}<span class="quality-max">/100</span>
						</span>
					{/if}
				</div>
				{#if lastQuality}
					<div class="quality-bar-track">
						<div class="quality-bar-fill" style="background: {qualityGradient(lastQuality.value)}; width: {lastQuality.value}%"></div>
					</div>
				{/if}
			</div>
		{:else}
			<div class="empty-card fade-in">
				<p>No sleep data recorded yet.</p>
			</div>
		{/if}

		<!-- Sleep Goals -->
		{#if weeklyAvg !== null}
			<div class="goals-card fade-in">
				<span class="card-label">Weekly Goal: 7-9h</span>
				<div class="goal-stats">
					<div class="goal-stat">
						<span class="goal-value">{weeklyAvg.toFixed(1)}h</span>
						<span class="goal-sub">avg this week</span>
					</div>
					<div class="goal-divider"></div>
					<div class="goal-stat">
						<span class="goal-value">{nightsOnTarget}</span>
						<span class="goal-sub">nights on target</span>
					</div>
				</div>
				<div class="goal-bar-track">
					<div class="goal-bar-fill" style="width: {Math.min(100, (nightsOnTarget / 7) * 100)}%"></div>
				</div>
			</div>
		{/if}

		<!-- Sleep Trends Chart -->
		{#if history.length > 0}
			<div class="chart-card fade-in">
				<div class="chart-header">
					<span class="card-label">Trends</span>
					<div class="toggle-pills">
						<button class:active={selectedDays === 7} onclick={() => selectPeriod(7)}>7D</button>
						<button class:active={selectedDays === 30} onclick={() => selectPeriod(30)}>30D</button>
						<button class:active={selectedDays === 90} onclick={() => selectPeriod(90)}>90D</button>
					</div>
				</div>
				<div class="chart-wrapper">
					<canvas bind:this={durationCanvas}></canvas>
				</div>
			</div>
		{/if}

		<!-- Sleep Insights -->
		{#if insights.length > 0}
			<div class="insights-section fade-in">
				<span class="card-label">Insights</span>
				<div class="insights-list">
					{#each insights as insight}
						<div class="insight-card" style="border-left-color: {insightBorderColor(insight.type)}">
							<p class="insight-text">{insight.text}</p>
							<span class="insight-source">{insight.source}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.sleep-page {
		--sleep-accent: #7c3aed;
		--sleep-accent-soft: #7c3aed30;
		--sleep-bg: #1a1028;
	}

	.page-header {
		margin-bottom: 1.25rem;
	}

	.header-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.back-link {
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		transition: color 0.2s;
	}

	.back-link:hover {
		color: var(--text-primary);
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 600;
	}

	/* Last Night Card */
	.last-night-card {
		background: linear-gradient(135deg, var(--sleep-bg), var(--bg-card));
		border-radius: 16px;
		padding: 20px;
		border: 1px solid var(--sleep-accent-soft);
		margin-bottom: 12px;
	}

	.card-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 500;
		display: block;
		margin-bottom: 10px;
	}

	.last-night-main {
		display: flex;
		align-items: baseline;
		gap: 16px;
		margin-bottom: 14px;
	}

	.duration-large {
		font-size: 2rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}

	.quality-badge {
		font-size: 1.3rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.quality-max {
		font-size: 0.8rem;
		font-weight: 400;
		opacity: 0.6;
	}

	.quality-bar-track {
		height: 6px;
		background: var(--bg-elevated);
		border-radius: 3px;
		overflow: hidden;
	}

	.quality-bar-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.6s ease;
	}

	/* Goals Card */
	.goals-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 16px;
		border: 1px solid var(--border);
		margin-bottom: 12px;
	}

	.goal-stats {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 12px;
	}

	.goal-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: 1;
	}

	.goal-value {
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}

	.goal-sub {
		font-size: 0.7rem;
		color: var(--text-secondary);
		margin-top: 2px;
	}

	.goal-divider {
		width: 1px;
		height: 36px;
		background: var(--border);
	}

	.goal-bar-track {
		height: 4px;
		background: var(--bg-elevated);
		border-radius: 2px;
		overflow: hidden;
	}

	.goal-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--sleep-accent), #a78bfa);
		border-radius: 2px;
		transition: width 0.6s ease;
	}

	/* Chart Card */
	.chart-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 16px;
		border: 1px solid var(--border);
		margin-bottom: 12px;
	}

	.chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.chart-header .card-label {
		margin-bottom: 0;
	}

	.toggle-pills {
		display: flex;
		gap: 4px;
		background: var(--bg-elevated);
		border-radius: 10px;
		padding: 3px;
	}

	.toggle-pills button {
		background: none;
		border: none;
		color: var(--text-secondary);
		padding: 5px 12px;
		border-radius: 8px;
		font-size: 0.75rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.toggle-pills button.active {
		background: var(--sleep-accent);
		color: var(--text-primary);
	}

	.chart-wrapper {
		height: 240px;
		position: relative;
	}

	/* Insights */
	.insights-section {
		margin-bottom: 12px;
	}

	.insights-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.insight-card {
		background: var(--bg-card);
		border-radius: 10px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-left: 3px solid #8888a0;
	}

	.insight-text {
		font-size: 0.85rem;
		color: var(--text-primary);
		line-height: 1.4;
	}

	.insight-source {
		font-size: 0.65rem;
		color: var(--text-secondary);
		margin-top: 4px;
		display: block;
	}

	/* Empty / skeleton */
	.empty-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 2rem 1rem;
		border: 1px solid var(--border);
		text-align: center;
		color: var(--text-secondary);
		margin-bottom: 12px;
	}

	.skeleton-group {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
