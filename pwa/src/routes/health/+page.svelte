<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import type { HealthMetric, HealthHistoryPoint, WaterLog, MoodEntry } from '$lib/api';
	import Chart from 'chart.js/auto';
	import { createGradient, mergeOptions } from '$lib/charts';
	import type { ChartOptions } from 'chart.js';

	let todayMetrics = $state<HealthMetric[]>([]);
	let history = $state<HealthHistoryPoint[]>([]);
	let loading = $state(true);

	// Water tracking
	let waterGlasses = $state(0);
	let waterLogging = $state(false);
	const WATER_TARGET = 8;

	// Mood tracking
	let todayMood = $state<MoodEntry | null>(null);
	let moodSelection = $state(0);
	let energySelection = $state(0);
	let moodNotes = $state('');
	let moodSubmitting = $state(false);
	let moodHistory = $state<MoodEntry[]>([]);
	let moodSparkCanvas = $state<HTMLCanvasElement | null>(null);
	let moodSparkChart: Chart | null = null;
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

	/** Handle card tap: navigate to sleep page for sleep_duration, expand otherwise */
	function handleCardTap(type: string) {
		if (type === 'sleep_duration') {
			goto(`${base}/sleep`);
			return;
		}
		toggleMetric(type);
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

		const gradient = createGradient(ctx, config.color, canvas.height);

		const chartOpts = mergeOptions({
			plugins: {
				legend: { display: false },
				tooltip: {
					borderColor: config.color,
					displayColors: false,
					callbacks: {
						label: (tooltipCtx) => {
							const val = tooltipCtx.parsed.y;
							return `${formatValue(val, type)} ${config.unit}`.trim();
						},
					},
				},
			},
		} as ChartOptions<'line'>);

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
						pointBackgroundColor: config.color,
						pointBorderColor: config.color,
					},
				],
			},
			options: chartOpts,
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

				const gradient = createGradient(ctx, config.color, overviewCanvas?.height ?? 220);

				return {
					label: config.label,
					data: allDates.map((d) => dateMap.get(d) ?? null),
					borderColor: config.color,
					backgroundColor: gradient,
					fill: true,
					yAxisID: m === 'steps' ? 'y' : 'y1',
				};
			});

		const chartOpts = mergeOptions({
			scales: {
				y: { position: 'left' as const },
				y1: {
					position: 'right' as const,
					grid: { color: '#2a2a3a20' },
					ticks: { color: '#8888a0', font: { size: 10 } },
					border: { display: false },
				},
			},
		} as ChartOptions<'line'>);

		overviewChart = new Chart(overviewCanvas, {
			type: 'line',
			data: {
				labels: allDates.map((d) => d.slice(5)),
				datasets,
			},
			options: chartOpts,
		});
	}

	function insightBorderColor(type: string): string {
		if (type === 'positive') return '#22c55e';
		if (type === 'negative') return '#ef4444';
		return '#8888a0';
	}

	async function addWaterGlass() {
		if (waterLogging) return;
		waterLogging = true;
		waterGlasses += 1; // optimistic
		try {
			await api.water.log();
			const result = await api.water.today();
			if (result) waterGlasses = result.glasses;
		} catch {
			waterGlasses = Math.max(0, waterGlasses - 1); // revert on failure
		}
		waterLogging = false;
	}

	async function submitMood() {
		if (moodSubmitting || moodSelection === 0 || energySelection === 0) return;
		moodSubmitting = true;
		try {
			await api.mood.log({
				mood: moodSelection,
				energy: energySelection,
				notes: moodNotes || undefined,
			});
			todayMood = await api.mood.today();
			moodHistory = await api.mood.history(7);
			requestAnimationFrame(() => renderMoodSparkline());
		} catch {
			// submission failed
		}
		moodSubmitting = false;
	}

	function renderMoodSparkline() {
		if (!moodSparkCanvas || moodHistory.length === 0) return;
		if (moodSparkChart) moodSparkChart.destroy();

		const sorted = [...moodHistory].sort(
			(a, b) => a.log_date.localeCompare(b.log_date),
		);
		const labels = sorted.map((e) => e.log_date.slice(5));
		const moodData = sorted.map((e) => e.mood);
		const energyData = sorted.map((e) => e.energy);

		moodSparkChart = new Chart(moodSparkCanvas, {
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						label: 'Mood',
						data: moodData,
						borderColor: '#f59e0b',
						backgroundColor: '#f59e0b20',
						fill: false,
						tension: 0.4,
						pointRadius: 3,
						pointBackgroundColor: '#f59e0b',
						borderWidth: 2,
					},
					{
						label: 'Energy',
						data: energyData,
						borderColor: '#22c55e',
						backgroundColor: '#22c55e20',
						fill: false,
						tension: 0.4,
						pointRadius: 3,
						pointBackgroundColor: '#22c55e',
						borderWidth: 2,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						labels: {
							color: '#8888a0',
							font: { family: 'Inter', size: 10 },
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
						padding: 8,
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
						min: 1,
						max: 5,
						ticks: {
							stepSize: 1,
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

	onMount(async () => {
		const [t, h, w, mToday, mHist] = await Promise.allSettled([
			api.health.today(),
			api.health.history(14),
			api.water.today(),
			api.mood.today(),
			api.mood.history(7),
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
		if (w.status === 'fulfilled' && w.value) waterGlasses = w.value.glasses;
		if (mToday.status === 'fulfilled' && mToday.value) {
			todayMood = mToday.value;
			moodSelection = mToday.value.mood;
			energySelection = mToday.value.energy;
			moodNotes = mToday.value.notes ?? '';
		}
		if (mHist.status === 'fulfilled') moodHistory = mHist.value;
		loading = false;
		requestAnimationFrame(() => {
			renderOverviewChart();
			renderMoodSparkline();
		});
	});

	onDestroy(() => {
		if (overviewChart) overviewChart.destroy();
		if (moodSparkChart) moodSparkChart.destroy();
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
					onclick={() => selectedDays > 0 ? handleCardTap(type) : null}
					onkeydown={(e) => e.key === 'Enter' && selectedDays > 0 ? handleCardTap(type) : null}
					role={selectedDays > 0 ? 'button' : undefined}
					tabindex={selectedDays > 0 ? 0 : undefined}
				>
					<div class="vital-header">
						<span class="vital-label" style={isExpanded ? `color: ${config.color}` : ''}>{config.label}</span>
						{#if selectedDays > 0}
							{#if type === 'sleep_duration'}
								<span class="expand-hint" title="Open sleep analysis">&rarr;</span>
							{:else}
								<span class="expand-hint">{isExpanded ? '\u25B2' : '\u25BC'}</span>
							{/if}
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

		<!-- Water Intake -->
		<section class="water-section fade-in">
			<div class="water-header">
				<span class="water-icon">{'\u{1F4A7}'}</span>
				<span class="water-count">{waterGlasses} / {WATER_TARGET} glasses</span>
			</div>
			<div class="water-progress-bar">
				<div
					class="water-progress-fill"
					style="width: {Math.min((waterGlasses / WATER_TARGET) * 100, 100)}%"
				></div>
			</div>
			<button class="water-add-btn" onclick={addWaterGlass} disabled={waterLogging}>
				+ Add Glass
			</button>
		</section>

		<!-- Mood & Energy -->
		<section class="mood-section fade-in">
			<h2 class="mood-title">How are you feeling?</h2>

			<div class="mood-row">
				<span class="mood-row-label">Mood</span>
				<div class="emoji-buttons">
					{#each [{e: '\u{1F62B}', v: 1}, {e: '\u{1F615}', v: 2}, {e: '\u{1F610}', v: 3}, {e: '\u{1F642}', v: 4}, {e: '\u{1F604}', v: 5}] as item}
						<button
							class="emoji-btn"
							class:emoji-selected={moodSelection === item.v}
							onclick={() => (moodSelection = item.v)}
						>{item.e}</button>
					{/each}
				</div>
			</div>

			<div class="mood-row">
				<span class="mood-row-label">Energy</span>
				<div class="emoji-buttons">
					{#each [{e: '\u{1FAAB}', v: 1}, {e: '\u{1F50B}', v: 2}, {e: '\u26A1', v: 3}, {e: '\u{1F4AA}', v: 4}, {e: '\u{1F525}', v: 5}] as item}
						<button
							class="emoji-btn"
							class:emoji-selected={energySelection === item.v}
							onclick={() => (energySelection = item.v)}
						>{item.e}</button>
					{/each}
				</div>
			</div>

			<textarea
				class="mood-notes"
				placeholder="Notes (optional)"
				bind:value={moodNotes}
				rows="2"
			></textarea>

			<button
				class="mood-submit-btn"
				onclick={submitMood}
				disabled={moodSubmitting || moodSelection === 0 || energySelection === 0}
			>
				{#if todayMood}Update{:else}Log Mood{/if}
			</button>

			{#if moodHistory.length > 0}
				<div class="mood-sparkline-wrapper">
					<h3 class="sparkline-label">Last 7 days</h3>
					<div class="sparkline-chart">
						<canvas bind:this={moodSparkCanvas}></canvas>
					</div>
				</div>
			{/if}
		</section>

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

	/* Water intake section */
	.water-section {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1.25rem;
		border: 1px solid var(--border);
	}

	.water-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
	}

	.water-icon {
		font-size: 1.2rem;
	}

	.water-count {
		font-size: 0.95rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.water-progress-bar {
		height: 8px;
		background: var(--bg-elevated);
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 10px;
	}

	.water-progress-fill {
		height: 100%;
		background: #06b6d4;
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.water-add-btn {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-primary);
		padding: 8px 16px;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: border-color 0.2s, background 0.2s;
		width: 100%;
	}

	.water-add-btn:hover:not(:disabled) {
		border-color: #06b6d4;
		background: #06b6d410;
	}

	.water-add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Mood & energy section */
	.mood-section {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1.25rem;
		border: 1px solid var(--border);
	}

	.mood-title {
		font-size: 0.8rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.75rem;
		font-weight: 500;
	}

	.mood-row {
		margin-bottom: 10px;
	}

	.mood-row-label {
		display: block;
		font-size: 0.75rem;
		color: var(--text-secondary);
		margin-bottom: 6px;
		font-weight: 500;
	}

	.emoji-buttons {
		display: flex;
		gap: 6px;
	}

	.emoji-btn {
		flex: 1;
		padding: 8px 0;
		font-size: 1.4rem;
		background: var(--bg-elevated);
		border: 2px solid transparent;
		border-radius: 10px;
		cursor: pointer;
		transition: border-color 0.2s, transform 0.15s;
	}

	.emoji-btn:hover {
		transform: scale(1.1);
	}

	.emoji-btn.emoji-selected {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.mood-notes {
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 12px;
		color: var(--text-primary);
		font-size: 0.85rem;
		font-family: inherit;
		resize: none;
		margin-bottom: 10px;
	}

	.mood-notes::placeholder {
		color: var(--text-secondary);
	}

	.mood-notes:focus {
		outline: none;
		border-color: var(--accent);
	}

	.mood-submit-btn {
		background: var(--accent);
		border: none;
		border-radius: 8px;
		color: var(--text-primary);
		padding: 10px 0;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		width: 100%;
		transition: opacity 0.2s;
	}

	.mood-submit-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.mood-sparkline-wrapper {
		margin-top: 14px;
	}

	.sparkline-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 500;
		margin-bottom: 6px;
	}

	.sparkline-chart {
		height: 120px;
		position: relative;
	}
</style>
