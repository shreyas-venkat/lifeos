<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api';
	import type { HealthMetric, HealthHistoryPoint, Streak } from '$lib/api';
	import Chart from 'chart.js/auto';
	import StreakCard from '$lib/components/StreakCard.svelte';

	let todayMetrics = $state<HealthMetric[]>([]);
	let history = $state<HealthHistoryPoint[]>([]);
	let streaks = $state<Streak[]>([]);
	let loading = $state(true);
	/** 0 = Today tab; 7/30/90 = period tabs */
	let selectedDays = $state(7);

	/** Which metric card is expanded (null = none) */
	let expandedMetric = $state<string | null>(null);

	/** Context insights for expanded metric */
	let contextInsights = $state<{ text: string; type: string; source: string }[]>([]);
	let contextLoading = $state(false);

	// Chart refs: one overview canvas + per-metric canvases
	let overviewCanvas = $state<HTMLCanvasElement | null>(null);
	let overviewChart: Chart | null = null;
	let metricCanvases: Record<string, HTMLCanvasElement | null> = {};
	let metricCharts: Record<string, Chart> = {};

	/** Computed average values per metric_type for the current period */
	let periodAverages = $state<Record<string, number | null>>({});
	/** Trend direction per metric_type: 1 = up, -1 = down, 0 = flat/unknown */
	let trendDirection = $state<Record<string, number>>({});

	const metricConfig: Record<string, { label: string; unit: string; color: string }> = {
		steps: { label: 'Steps', unit: '', color: '#6366f1' },
		heart_rate: { label: 'HR', unit: 'bpm', color: '#ef4444' },
		hrv: { label: 'HRV', unit: 'ms', color: '#8b5cf6' },
		spo2: { label: 'SpO2', unit: '%', color: '#06b6d4' },
		weight: { label: 'Weight', unit: 'kg', color: '#f59e0b' },
		sleep_duration: { label: 'Sleep', unit: 'h', color: '#22c55e' },
	};

	const metricTypes = Object.keys(metricConfig);

	function getLatestMetric(type: string): HealthMetric | undefined {
		return todayMetrics.find((m) => m.metric_type === type);
	}

	function formatValue(value: number | null | undefined, metricType: string): string {
		if (value === null || value === undefined) return '\u2014';
		if (metricType === 'steps') return Math.round(value).toLocaleString();
		if (metricType === 'sleep_duration') return value.toFixed(1);
		if (metricType === 'weight') return value.toFixed(1);
		return String(Math.round(value));
	}

	function periodLabel(): string {
		if (selectedDays === 0) return 'today';
		return `${selectedDays}d avg`;
	}

	function computeAverages(points: HealthHistoryPoint[]): Record<string, number | null> {
		const grouped: Record<string, number[]> = {};
		for (const p of points) {
			if (!grouped[p.metric_type]) grouped[p.metric_type] = [];
			grouped[p.metric_type].push(p.avg_value);
		}
		const result: Record<string, number | null> = {};
		for (const type of metricTypes) {
			const values = grouped[type];
			if (!values || values.length === 0) {
				result[type] = null;
			} else {
				result[type] = values.reduce((a, b) => a + b, 0) / values.length;
			}
		}
		return result;
	}

	function splitPeriods(allData: HealthHistoryPoint[], days: number) {
		const today = new Date();
		const cutoff = new Date(today);
		cutoff.setDate(cutoff.getDate() - days);
		const cutoffStr = cutoff.toISOString().slice(0, 10);

		const current = allData.filter((p) => p.date > cutoffStr);
		const prior = allData.filter((p) => p.date <= cutoffStr);
		return { current, prior };
	}

	function computeTrends(currentAvg: Record<string, number | null>, priorAvg: Record<string, number | null>): Record<string, number> {
		const trends: Record<string, number> = {};
		for (const type of metricTypes) {
			const cur = currentAvg[type];
			const prev = priorAvg[type];
			if (cur === null || prev === null || prev === 0) {
				trends[type] = 0;
			} else if (cur > prev) {
				trends[type] = 1;
			} else if (cur < prev) {
				trends[type] = -1;
			} else {
				trends[type] = 0;
			}
		}
		return trends;
	}

	function trendClass(type: string, direction: number): string {
		if (direction === 0) return '';
		if (type === 'heart_rate' || type === 'weight') return '';
		return direction > 0 ? 'trend-good' : 'trend-bad';
	}

	function trendArrow(direction: number): string {
		if (direction > 0) return '\u2191';
		if (direction < 0) return '\u2193';
		return '';
	}

	/** Toggle card expansion */
	async function toggleMetric(type: string) {
		if (expandedMetric === type) {
			expandedMetric = null;
			contextInsights = [];
			// Destroy metric chart
			if (metricCharts[type]) {
				metricCharts[type].destroy();
				delete metricCharts[type];
			}
			return;
		}

		// Collapse previous
		if (expandedMetric && metricCharts[expandedMetric]) {
			metricCharts[expandedMetric].destroy();
			delete metricCharts[expandedMetric];
		}

		expandedMetric = type;
		contextInsights = [];
		contextLoading = true;

		// Render the individual chart after DOM updates
		requestAnimationFrame(() => {
			renderMetricChart(type);
		});

		// Fetch context insights (non-blocking)
		try {
			const today = new Date().toISOString().slice(0, 10);
			const result = await api.health.context(type, today);
			if (result && result.insights && result.insights.length > 0) {
				contextInsights = result.insights;
			}
		} catch {
			// Context endpoint may not exist yet -- that's fine
		}
		contextLoading = false;
	}

	/** Render chart for a single expanded metric */
	function renderMetricChart(type: string) {
		const canvas = metricCanvases[type];
		if (!canvas || history.length === 0) return;

		if (metricCharts[type]) metricCharts[type].destroy();

		const config = metricConfig[type];
		const points = history.filter((p) => p.metric_type === type);
		if (points.length === 0) return;

		const dates = [...new Set(points.map((p) => p.date))].sort();
		const dateMap = new Map(points.map((p) => [p.date, p.avg_value]));

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Create gradient fill
		const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
		gradient.addColorStop(0, config.color + '40');
		gradient.addColorStop(1, config.color + '05');

		metricCharts[type] = new Chart(canvas, {
			type: 'line',
			data: {
				labels: dates.map((d) => d.slice(5)),
				datasets: [
					{
						label: config.label,
						data: dates.map((d) => dateMap.get(d) ?? null),
						borderColor: config.color,
						backgroundColor: gradient,
						fill: true,
						tension: 0.4,
						pointRadius: 2,
						pointHoverRadius: 6,
						pointBackgroundColor: config.color,
						pointBorderColor: config.color,
						borderWidth: 2,
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
					legend: { display: false },
					tooltip: {
						backgroundColor: '#1a1a24',
						titleColor: '#e8e8ed',
						bodyColor: '#e8e8ed',
						borderColor: config.color,
						borderWidth: 1,
						padding: 10,
						cornerRadius: 8,
						displayColors: false,
						callbacks: {
							label: (ctx) => {
								const val = ctx.parsed.y;
								return `${formatValue(val, type)} ${config.unit}`.trim();
							},
						},
					},
				},
				scales: {
					x: {
						ticks: { color: '#8888a0', font: { family: 'Inter', size: 10 } },
						grid: { display: false },
						border: { display: false },
					},
					y: {
						ticks: { color: '#8888a0', font: { family: 'Inter', size: 10 } },
						grid: { display: false },
						border: { display: false },
					},
				},
			},
		});
	}

	async function selectTab(days: number) {
		selectedDays = days;
		expandedMetric = null;
		contextInsights = [];

		// Destroy any open metric charts
		for (const key of Object.keys(metricCharts)) {
			metricCharts[key].destroy();
		}
		metricCharts = {};

		if (days === 0) {
			todayMetrics = await api.health.today();
			periodAverages = {};
			trendDirection = {};
			if (overviewChart) {
				overviewChart.destroy();
				overviewChart = null;
			}
		} else {
			const doubleHistory = await api.health.history(days * 2);
			const { current, prior } = splitPeriods(doubleHistory, days);
			history = current;
			periodAverages = computeAverages(current);
			const priorAvg = computeAverages(prior);
			trendDirection = computeTrends(periodAverages, priorAvg);
			requestAnimationFrame(() => renderOverviewChart());
		}
	}

	function renderOverviewChart() {
		if (!overviewCanvas || history.length === 0) return;
		if (overviewChart) overviewChart.destroy();

		const grouped: Record<string, HealthHistoryPoint[]> = {};
		for (const point of history) {
			if (!grouped[point.metric_type]) grouped[point.metric_type] = [];
			grouped[point.metric_type].push(point);
		}

		const chartMetrics = ['steps', 'heart_rate', 'sleep_duration'];
		const allDates = [...new Set(history.map((p) => p.date))].sort();

		const ctx = overviewCanvas.getContext('2d');
		if (!ctx) return;

		const datasets = chartMetrics
			.filter((m) => grouped[m])
			.map((m) => {
				const config = metricConfig[m];
				const points = grouped[m];
				const dateMap = new Map(points.map((p) => [p.date, p.avg_value]));

				const gradient = ctx.createLinearGradient(0, 0, 0, overviewCanvas?.height ?? 220);
				gradient.addColorStop(0, config.color + '30');
				gradient.addColorStop(1, config.color + '05');

				return {
					label: config.label,
					data: allDates.map((d) => dateMap.get(d) ?? null),
					borderColor: config.color,
					backgroundColor: gradient,
					fill: true,
					tension: 0.4,
					pointRadius: 2,
					pointHoverRadius: 5,
					borderWidth: 2,
					yAxisID: m === 'steps' ? 'y' : 'y1',
				};
			});

		overviewChart = new Chart(overviewCanvas, {
			type: 'line',
			data: {
				labels: allDates.map((d) => d.slice(5)),
				datasets,
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
						borderColor: '#2a2a3a',
						borderWidth: 1,
						padding: 10,
						cornerRadius: 8,
					},
				},
				scales: {
					x: {
						ticks: { color: '#8888a0', font: { family: 'Inter', size: 10 } },
						grid: { display: false },
						border: { display: false },
					},
					y: {
						position: 'left',
						ticks: { color: '#8888a0', font: { family: 'Inter', size: 10 } },
						grid: { display: false },
						border: { display: false },
					},
					y1: {
						position: 'right',
						ticks: { color: '#8888a0', font: { family: 'Inter', size: 10 } },
						grid: { display: false },
						border: { display: false },
					},
				},
			},
		});
	}

	function insightBorderColor(type: string): string {
		if (type === 'positive') return '#22c55e';
		if (type === 'negative') return '#ef4444';
		return '#8888a0';
	}

	onMount(async () => {
		const [t, h, s] = await Promise.allSettled([
			api.health.today(),
			api.health.history(14),
			api.streaks.list(),
		]);
		if (t.status === 'fulfilled') todayMetrics = t.value;
		if (h.status === 'fulfilled') {
			const allData = h.value;
			const { current, prior } = splitPeriods(allData, 7);
			history = current;
			periodAverages = computeAverages(current);
			const priorAvg = computeAverages(prior);
			trendDirection = computeTrends(periodAverages, priorAvg);
		}
		if (s.status === 'fulfilled') streaks = s.value;
		loading = false;
		requestAnimationFrame(() => renderOverviewChart());
	});

	onDestroy(() => {
		if (overviewChart) overviewChart.destroy();
		for (const key of Object.keys(metricCharts)) {
			metricCharts[key].destroy();
		}
	});
</script>

<svelte:head>
	<title>Health - LifeOS</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<h1>Health</h1>
		<div class="toggle-pills">
			<button class:active={selectedDays === 0} onclick={() => selectTab(0)}>Today</button>
			<button class:active={selectedDays === 7} onclick={() => selectTab(7)}>7D</button>
			<button class:active={selectedDays === 30} onclick={() => selectTab(30)}>30D</button>
			<button class:active={selectedDays === 90} onclick={() => selectTab(90)}>90D</button>
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
				{@const config = metricConfig[type]}
				{@const displayValue = selectedDays === 0
					? formatValue(getLatestMetric(type)?.value ?? null, type)
					: formatValue(periodAverages[type] ?? null, type)}
				{@const trend = trendDirection[type] ?? 0}
				{@const isExpanded = expandedMetric === type}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="vital-card"
					class:expanded={isExpanded}
					style={isExpanded ? `border-color: ${config.color}40` : ''}
					onclick={() => selectedDays > 0 ? toggleMetric(type) : null}
					onkeydown={(e) => e.key === 'Enter' && selectedDays > 0 ? toggleMetric(type) : null}
					role={selectedDays > 0 ? 'button' : undefined}
					tabindex={selectedDays > 0 ? 0 : undefined}
				>
					<div class="vital-header">
						<span class="vital-label" style={isExpanded ? `color: ${config.color}` : ''}>{config.label}</span>
						{#if selectedDays > 0}
							<span class="expand-hint">{isExpanded ? '\u25B2' : '\u25BC'}</span>
						{/if}
					</div>
					<div class="vital-row">
						<span class="vital-value" class:muted={displayValue === '\u2014'}>
							{displayValue}
						</span>
						{#if selectedDays > 0 && trend !== 0}
							<span class="trend-arrow {trendClass(type, trend)}">
								{trendArrow(trend)}
							</span>
						{/if}
					</div>
					{#if config.unit && displayValue !== '\u2014'}
						<span class="vital-unit">{config.unit}</span>
					{/if}
					<span class="vital-period">{periodLabel()}</span>

					{#if isExpanded}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div class="expanded-chart" onclick={(e) => e.stopPropagation()}>
							<div class="metric-chart-wrapper">
								<canvas bind:this={metricCanvases[type]}></canvas>
							</div>

							{#if contextLoading}
								<div class="context-loading">
									<div class="skeleton" style="height: 40px; width: 100%;"></div>
								</div>
							{/if}

							{#if contextInsights.length > 0}
								<div class="context-panel">
									{#each contextInsights as insight}
										<div class="insight-card" style="border-left-color: {insightBorderColor(insight.type)}">
											<p class="insight-text">{insight.text}</p>
											<span class="insight-source">{insight.source}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		{#if streaks.length > 0}
			<div class="streaks-section fade-in">
				<h2>Streaks</h2>
				<div class="streaks-grid">
					{#each streaks as streak (streak.type)}
						<StreakCard {streak} />
					{/each}
				</div>
			</div>
		{/if}

		{#if selectedDays > 0 && history.length > 0 && !expandedMetric}
			<div class="chart-section fade-in">
				<h2>Trends</h2>
				<div class="chart-wrapper">
					<canvas bind:this={overviewCanvas}></canvas>
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
		transition: border-color 0.2s, transform 150ms ease, box-shadow 150ms ease;
		cursor: pointer;
	}

	.vital-card:active {
		transform: scale(0.98);
	}

	.vital-card.expanded {
		grid-column: 1 / -1;
		cursor: default;
	}

	.vital-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.vital-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 500;
		transition: color 0.2s;
	}

	.expand-hint {
		font-size: 0.55rem;
		color: var(--text-secondary);
		opacity: 0.5;
	}

	.vital-row {
		display: flex;
		align-items: baseline;
		gap: 6px;
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

	.vital-period {
		font-size: 0.65rem;
		color: var(--text-secondary);
		opacity: 0.7;
	}

	.trend-arrow {
		font-size: 0.9rem;
		font-weight: 700;
	}

	.trend-arrow.trend-good {
		color: #22c55e;
	}

	.trend-arrow.trend-bad {
		color: #ef4444;
	}

	/* Expanded metric chart */
	.expanded-chart {
		margin-top: 12px;
		width: 100%;
	}

	.metric-chart-wrapper {
		height: 200px;
		position: relative;
		width: 100%;
	}

	/* Context insights panel */
	.context-panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}

	.context-loading {
		margin-top: 12px;
	}

	.insight-card {
		background: var(--bg-elevated);
		border-radius: 8px;
		padding: 10px 12px;
		border-left: 3px solid #8888a0;
	}

	.insight-text {
		font-size: 0.8rem;
		color: var(--text-primary);
		line-height: 1.4;
	}

	.insight-source {
		font-size: 0.65rem;
		color: var(--text-secondary);
		margin-top: 4px;
		display: block;
	}

	/* Streaks section */
	.streaks-section {
		margin-bottom: 1.25rem;
	}

	.streaks-section h2 {
		font-size: 0.8rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.75rem;
		font-weight: 500;
	}

	.streaks-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	/* Overview chart */
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
