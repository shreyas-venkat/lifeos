<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api';
	import type { BodyMetricLatest, BodyHistoryPoint, PreferenceRow } from '$lib/api';
	import Chart from 'chart.js/auto';

	// --- State ---
	let latestMetrics = $state<BodyMetricLatest[]>([]);
	let history = $state<BodyHistoryPoint[]>([]);
	let preferences = $state<PreferenceRow[]>([]);
	let loading = $state(true);
	let selectedDays = $state(90);

	// Manual entry form
	let showForm = $state(false);
	let formWeight = $state('');
	let formBodyFat = $state('');
	let formMuscleMass = $state('');
	let formBodyWater = $state('');
	let formSubmitting = $state(false);
	let formError = $state('');
	let formSuccess = $state('');

	// Charts
	let weightCanvas = $state<HTMLCanvasElement | null>(null);
	let compCanvas = $state<HTMLCanvasElement | null>(null);
	let bmrCanvas = $state<HTMLCanvasElement | null>(null);
	let weightChart: Chart | null = null;
	let compChart: Chart | null = null;
	let bmrChart: Chart | null = null;

	// --- Metric config ---
	const metricConfig: Record<string, { label: string; unit: string; color: string }> = {
		weight: { label: 'Weight', unit: 'kg', color: '#3b82f6' },
		bmi: { label: 'BMI', unit: '', color: '#8b5cf6' },
		body_fat: { label: 'Body Fat', unit: '%', color: '#f97316' },
		muscle_mass: { label: 'Muscle', unit: '%', color: '#22c55e' },
		body_water: { label: 'Water', unit: '%', color: '#06b6d4' },
		bmr: { label: 'BMR', unit: 'kcal', color: '#a855f7' },
	};

	const metricOrder = ['weight', 'bmi', 'body_fat', 'muscle_mass', 'body_water', 'bmr'];

	// --- Helpers ---
	function getLatest(type: string): BodyMetricLatest | undefined {
		return latestMetrics.find((m) => m.metric_type === type);
	}

	function formatValue(value: number | null | undefined, type: string): string {
		if (value === null || value === undefined) return '\u2014';
		if (type === 'weight') return value.toFixed(1);
		if (type === 'bmi') return value.toFixed(1);
		if (type === 'bmr') return Math.round(value).toLocaleString();
		return value.toFixed(1);
	}

	function getGoal(key: string): number | null {
		const pref = preferences.find((p) => p.key === key);
		if (!pref) return null;
		const val = Number(pref.value);
		return isNaN(val) ? null : val;
	}

	function goalProgress(current: number | null, target: number, lower: boolean): { pct: number; diff: string } {
		if (current === null) return { pct: 0, diff: '\u2014' };
		if (lower) {
			// Goal is to go down (e.g., weight, body fat)
			// We need a reference start point -- use a reasonable estimate
			const range = Math.max(current, target) * 0.2; // 20% range
			const progress = Math.max(0, Math.min(100, ((current - target) / range) * -100 + 100));
			const diff = current - target;
			return {
				pct: Math.round(progress),
				diff: diff > 0 ? `${diff.toFixed(1)} to go` : 'Goal reached',
			};
		}
		// Goal is to go up (e.g., muscle mass)
		const range = Math.max(current, target) * 0.2;
		const progress = Math.max(0, Math.min(100, ((target - current) / range) * -100 + 100));
		const diff = target - current;
		return {
			pct: Math.round(progress),
			diff: diff > 0 ? `${diff.toFixed(1)} to target` : 'Goal reached',
		};
	}

	/** Compute trend: compare last 7 days avg vs prior 7 days avg */
	function computeTrend(type: string): number {
		const points = history.filter((p) => p.metric_type === type);
		if (points.length < 2) return 0;

		const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
		const mid = Math.floor(sorted.length / 2);
		const recent = sorted.slice(mid);
		const prior = sorted.slice(0, mid);

		const avgRecent = recent.reduce((s, p) => s + p.avg_value, 0) / recent.length;
		const avgPrior = prior.reduce((s, p) => s + p.avg_value, 0) / prior.length;

		if (avgRecent > avgPrior * 1.001) return 1;
		if (avgRecent < avgPrior * 0.999) return -1;
		return 0;
	}

	function trendArrow(direction: number): string {
		if (direction > 0) return '\u2191';
		if (direction < 0) return '\u2193';
		return '';
	}

	function trendClass(type: string, direction: number): string {
		if (direction === 0) return '';
		// For weight and body_fat, down is good; for muscle, up is good
		if (type === 'weight' || type === 'body_fat' || type === 'bmi') {
			return direction < 0 ? 'trend-good' : 'trend-bad';
		}
		if (type === 'muscle_mass' || type === 'bmr') {
			return direction > 0 ? 'trend-good' : 'trend-bad';
		}
		return '';
	}

	/** Generate insight strings */
	function generateInsights(): string[] {
		const insights: string[] = [];
		const weightPoints = history.filter((p) => p.metric_type === 'weight');
		const fatPoints = history.filter((p) => p.metric_type === 'body_fat');
		const musclePoints = history.filter((p) => p.metric_type === 'muscle_mass');
		const bmrPoints = history.filter((p) => p.metric_type === 'bmr');

		if (weightPoints.length >= 2) {
			const sorted = [...weightPoints].sort((a, b) => a.date.localeCompare(b.date));
			const diff = sorted[sorted.length - 1].avg_value - sorted[0].avg_value;
			if (Math.abs(diff) >= 0.1) {
				const dir = diff < 0 ? 'down' : 'up';
				insights.push(`Weight ${dir} ${Math.abs(diff).toFixed(1)}kg over the period`);
			}
		}

		if (musclePoints.length >= 2) {
			const sorted = [...musclePoints].sort((a, b) => a.date.localeCompare(b.date));
			const diff = sorted[sorted.length - 1].avg_value - sorted[0].avg_value;
			if (diff > 0.1) {
				insights.push('Muscle mass trending up -- keep it up');
			} else if (diff < -0.1) {
				insights.push('Muscle mass trending down -- check protein intake');
			}
		}

		if (bmrPoints.length >= 2) {
			const sorted = [...bmrPoints].sort((a, b) => a.date.localeCompare(b.date));
			const diff = sorted[sorted.length - 1].avg_value - sorted[0].avg_value;
			if (diff > 5) {
				insights.push(`BMR increased by ${Math.round(diff)} kcal -- more muscle = more burn`);
			}
		}

		if (fatPoints.length >= 2) {
			const sorted = [...fatPoints].sort((a, b) => a.date.localeCompare(b.date));
			const diff = sorted[sorted.length - 1].avg_value - sorted[0].avg_value;
			if (diff < -0.2) {
				insights.push(`Body fat down ${Math.abs(diff).toFixed(1)}% -- solid progress`);
			}
		}

		return insights;
	}

	// --- Chart rendering ---
	function renderWeightChart() {
		if (!weightCanvas) return;
		if (weightChart) weightChart.destroy();

		const points = history
			.filter((p) => p.metric_type === 'weight')
			.sort((a, b) => a.date.localeCompare(b.date));

		if (points.length === 0) return;

		const ctx = weightCanvas.getContext('2d');
		if (!ctx) return;

		const gradient = ctx.createLinearGradient(0, 0, 0, weightCanvas.height);
		gradient.addColorStop(0, '#3b82f640');
		gradient.addColorStop(1, '#3b82f605');

		weightChart = new Chart(weightCanvas, {
			type: 'line',
			data: {
				labels: points.map((p) => p.date.slice(5)),
				datasets: [
					{
						label: 'Weight (kg)',
						data: points.map((p) => p.avg_value),
						borderColor: '#3b82f6',
						backgroundColor: gradient,
						fill: true,
						tension: 0.4,
						pointRadius: 2,
						pointHoverRadius: 6,
						pointBackgroundColor: '#3b82f6',
						borderWidth: 2,
					},
				],
			},
			options: chartOptions('kg'),
		});
	}

	function renderCompositionChart() {
		if (!compCanvas) return;
		if (compChart) compChart.destroy();

		const fatPoints = history
			.filter((p) => p.metric_type === 'body_fat')
			.sort((a, b) => a.date.localeCompare(b.date));
		const musclePoints = history
			.filter((p) => p.metric_type === 'muscle_mass')
			.sort((a, b) => a.date.localeCompare(b.date));

		if (fatPoints.length === 0 && musclePoints.length === 0) return;

		const allDates = [
			...new Set([...fatPoints.map((p) => p.date), ...musclePoints.map((p) => p.date)]),
		].sort();

		const fatMap = new Map(fatPoints.map((p) => [p.date, p.avg_value]));
		const muscleMap = new Map(musclePoints.map((p) => [p.date, p.avg_value]));

		compChart = new Chart(compCanvas, {
			type: 'line',
			data: {
				labels: allDates.map((d) => d.slice(5)),
				datasets: [
					{
						label: 'Body Fat %',
						data: allDates.map((d) => fatMap.get(d) ?? null),
						borderColor: '#f97316',
						backgroundColor: '#f9731610',
						fill: false,
						tension: 0.4,
						pointRadius: 2,
						pointHoverRadius: 6,
						borderWidth: 2,
					},
					{
						label: 'Muscle %',
						data: allDates.map((d) => muscleMap.get(d) ?? null),
						borderColor: '#22c55e',
						backgroundColor: '#22c55e10',
						fill: false,
						tension: 0.4,
						pointRadius: 2,
						pointHoverRadius: 6,
						borderWidth: 2,
					},
				],
			},
			options: chartOptions('%'),
		});
	}

	function renderBmrChart() {
		if (!bmrCanvas) return;
		if (bmrChart) bmrChart.destroy();

		const points = history
			.filter((p) => p.metric_type === 'bmr')
			.sort((a, b) => a.date.localeCompare(b.date));

		if (points.length === 0) return;

		const ctx = bmrCanvas.getContext('2d');
		if (!ctx) return;

		const gradient = ctx.createLinearGradient(0, 0, 0, bmrCanvas.height);
		gradient.addColorStop(0, '#a855f740');
		gradient.addColorStop(1, '#a855f705');

		bmrChart = new Chart(bmrCanvas, {
			type: 'line',
			data: {
				labels: points.map((p) => p.date.slice(5)),
				datasets: [
					{
						label: 'BMR (kcal)',
						data: points.map((p) => p.avg_value),
						borderColor: '#a855f7',
						backgroundColor: gradient,
						fill: true,
						tension: 0.4,
						pointRadius: 2,
						pointHoverRadius: 6,
						pointBackgroundColor: '#a855f7',
						borderWidth: 2,
					},
				],
			},
			options: chartOptions('kcal'),
		});
	}

	function chartOptions(unit: string): Chart['options'] {
		return {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: 'index' as const, intersect: false },
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
					callbacks: {
						label: (ctx) => {
							const val = ctx.parsed.y;
							if (val === null) return '';
							return `${ctx.dataset.label}: ${unit === 'kcal' ? Math.round(val) : val.toFixed(1)} ${unit}`;
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
		};
	}

	function renderAllCharts() {
		requestAnimationFrame(() => {
			renderWeightChart();
			renderCompositionChart();
			renderBmrChart();
		});
	}

	// --- Data loading ---
	async function loadData() {
		const [latestRes, historyRes, prefsRes] = await Promise.allSettled([
			api.body.latest(),
			api.body.history(selectedDays),
			api.preferences.get(),
		]);

		if (latestRes.status === 'fulfilled') latestMetrics = latestRes.value;
		if (historyRes.status === 'fulfilled') history = historyRes.value;
		if (prefsRes.status === 'fulfilled') preferences = prefsRes.value;

		loading = false;
		renderAllCharts();
	}

	async function selectPeriod(days: number) {
		selectedDays = days;
		const historyRes = await api.body.history(days);
		history = historyRes;
		renderAllCharts();
	}

	// --- Form submission ---
	async function submitForm() {
		formError = '';
		formSuccess = '';

		const entry: Record<string, number> = {};
		if (formWeight.trim()) {
			const v = Number(formWeight);
			if (isNaN(v) || v <= 0) { formError = 'Invalid weight'; return; }
			entry.weight_kg = v;
		}
		if (formBodyFat.trim()) {
			const v = Number(formBodyFat);
			if (isNaN(v) || v <= 0 || v > 100) { formError = 'Invalid body fat %'; return; }
			entry.body_fat_pct = v;
		}
		if (formMuscleMass.trim()) {
			const v = Number(formMuscleMass);
			if (isNaN(v) || v <= 0 || v > 100) { formError = 'Invalid muscle mass %'; return; }
			entry.muscle_mass_pct = v;
		}
		if (formBodyWater.trim()) {
			const v = Number(formBodyWater);
			if (isNaN(v) || v <= 0 || v > 100) { formError = 'Invalid body water %'; return; }
			entry.body_water_pct = v;
		}

		if (Object.keys(entry).length === 0) {
			formError = 'Enter at least one measurement';
			return;
		}

		formSubmitting = true;
		try {
			await api.body.log(entry);
			formSuccess = 'Measurement logged';
			formWeight = '';
			formBodyFat = '';
			formMuscleMass = '';
			formBodyWater = '';
			// Reload data
			await loadData();
		} catch {
			formError = 'Failed to log measurement';
		}
		formSubmitting = false;
	}

	onMount(() => {
		loadData();
	});

	onDestroy(() => {
		if (weightChart) weightChart.destroy();
		if (compChart) compChart.destroy();
		if (bmrChart) bmrChart.destroy();
	});
</script>

<svelte:head>
	<title>Body Composition - LifeOS</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<h1>Body Composition</h1>
		<div class="toggle-pills">
			<button class:active={selectedDays === 30} onclick={() => selectPeriod(30)}>30D</button>
			<button class:active={selectedDays === 90} onclick={() => selectPeriod(90)}>90D</button>
			<button class:active={selectedDays === 365} onclick={() => selectPeriod(365)}>All</button>
		</div>
	</div>

	{#if loading}
		<div class="stats-grid">
			{#each Array(6) as _}
				<div class="skeleton" style="height: 80px;"></div>
			{/each}
		</div>
	{:else if latestMetrics.length === 0 && history.length === 0}
		<div class="empty-state fade-in">
			<p>No body composition data yet.</p>
			<p class="empty-hint">Use the button below to log your first measurement, or connect a smart scale.</p>
		</div>
	{:else}
		<!-- Current Stats Cards -->
		<div class="stats-grid fade-in">
			{#each metricOrder as type}
				{@const config = metricConfig[type]}
				{@const latest = getLatest(type)}
				{@const trend = computeTrend(type)}
				<div class="stat-card" style="border-top: 3px solid {config.color}">
					<span class="stat-label">{config.label}</span>
					<div class="stat-row">
						<span class="stat-value" class:muted={!latest}>
							{formatValue(latest?.value ?? null, type)}
						</span>
						{#if trend !== 0}
							<span class="trend-arrow {trendClass(type, trend)}">
								{trendArrow(trend)}
							</span>
						{/if}
					</div>
					{#if config.unit && latest}
						<span class="stat-unit">{config.unit}</span>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Goals Section -->
		{@const weightGoal = getGoal('target_weight')}
		{@const fatGoal = getGoal('target_body_fat')}
		{#if weightGoal || fatGoal}
			<div class="section-card fade-in">
				<h2>Goals</h2>
				{#if weightGoal}
					{@const currentWeight = getLatest('weight')?.value ?? null}
					{@const prog = goalProgress(currentWeight, weightGoal, true)}
					<div class="goal-row">
						<div class="goal-label">
							<span>Weight</span>
							<span class="goal-target">{weightGoal} kg</span>
						</div>
						<div class="progress-bar">
							<div class="progress-fill" style="width: {prog.pct}%; background: #3b82f6"></div>
						</div>
						<span class="goal-diff">{prog.diff}</span>
					</div>
				{/if}
				{#if fatGoal}
					{@const currentFat = getLatest('body_fat')?.value ?? null}
					{@const prog = goalProgress(currentFat, fatGoal, true)}
					<div class="goal-row">
						<div class="goal-label">
							<span>Body Fat</span>
							<span class="goal-target">{fatGoal}%</span>
						</div>
						<div class="progress-bar">
							<div class="progress-fill" style="width: {prog.pct}%; background: #f97316"></div>
						</div>
						<span class="goal-diff">{prog.diff}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Weight Trend Chart -->
		{#if history.some((p) => p.metric_type === 'weight')}
			<div class="chart-card fade-in">
				<h2>Weight Trend</h2>
				<div class="chart-wrapper">
					<canvas bind:this={weightCanvas}></canvas>
				</div>
			</div>
		{/if}

		<!-- Body Fat + Muscle Chart -->
		{#if history.some((p) => p.metric_type === 'body_fat' || p.metric_type === 'muscle_mass')}
			<div class="chart-card fade-in">
				<h2>Body Fat vs Muscle</h2>
				<div class="chart-wrapper">
					<canvas bind:this={compCanvas}></canvas>
				</div>
			</div>
		{/if}

		<!-- BMR Chart -->
		{#if history.some((p) => p.metric_type === 'bmr')}
			<div class="chart-card fade-in">
				<h2>BMR Trend</h2>
				<div class="chart-wrapper-sm">
					<canvas bind:this={bmrCanvas}></canvas>
				</div>
			</div>
		{/if}

		<!-- Insights -->
		{@const insights = generateInsights()}
		{#if insights.length > 0}
			<div class="section-card fade-in">
				<h2>Insights</h2>
				<div class="insights-list">
					{#each insights as insight}
						<div class="insight-item">{insight}</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}

	<!-- Manual Entry -->
	<div class="form-section fade-in">
		<button class="log-btn" onclick={() => { showForm = !showForm; formError = ''; formSuccess = ''; }}>
			{showForm ? 'Cancel' : 'Log Measurement'}
		</button>

		{#if showForm}
			<div class="log-form">
				<div class="form-row">
					<label for="weight">Weight (kg)</label>
					<input id="weight" type="number" step="0.1" placeholder="75.0" bind:value={formWeight} />
				</div>
				<div class="form-row">
					<label for="bodyfat">Body Fat (%)</label>
					<input id="bodyfat" type="number" step="0.1" placeholder="18.5" bind:value={formBodyFat} />
				</div>
				<div class="form-row">
					<label for="muscle">Muscle Mass (%)</label>
					<input id="muscle" type="number" step="0.1" placeholder="42.0" bind:value={formMuscleMass} />
				</div>
				<div class="form-row">
					<label for="water">Body Water (%)</label>
					<input id="water" type="number" step="0.1" placeholder="55.0" bind:value={formBodyWater} />
				</div>

				{#if formError}
					<p class="form-error">{formError}</p>
				{/if}
				{#if formSuccess}
					<p class="form-success">{formSuccess}</p>
				{/if}

				<button class="submit-btn" onclick={submitForm} disabled={formSubmitting}>
					{formSubmitting ? 'Saving...' : 'Save'}
				</button>
			</div>
		{/if}
	</div>
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
		cursor: pointer;
	}

	.toggle-pills button.active {
		background: var(--accent);
		color: var(--text-primary);
	}

	/* Stats grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin-bottom: 1.25rem;
	}

	@media (max-width: 400px) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.stat-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		border: 1px solid var(--border);
	}

	.stat-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 500;
	}

	.stat-row {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}

	.stat-value {
		font-size: 1.35rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}

	.stat-value.muted {
		color: var(--text-secondary);
		font-weight: 400;
	}

	.stat-unit {
		font-size: 0.7rem;
		color: var(--text-secondary);
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

	/* Section cards */
	.section-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 1rem;
		border: 1px solid var(--border);
		margin-bottom: 1rem;
	}

	.section-card h2 {
		font-size: 0.8rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.75rem;
		font-weight: 500;
	}

	/* Goals */
	.goal-row {
		margin-bottom: 0.75rem;
	}

	.goal-row:last-child {
		margin-bottom: 0;
	}

	.goal-label {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		margin-bottom: 6px;
	}

	.goal-target {
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.progress-bar {
		height: 6px;
		background: var(--bg-elevated, #1a1a24);
		border-radius: 3px;
		overflow: hidden;
		margin-bottom: 4px;
	}

	.progress-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.5s ease;
	}

	.goal-diff {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	/* Charts */
	.chart-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 1rem;
		border: 1px solid var(--border);
		margin-bottom: 1rem;
	}

	.chart-card h2 {
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

	.chart-wrapper-sm {
		height: 160px;
		position: relative;
	}

	/* Insights */
	.insights-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.insight-item {
		font-size: 0.85rem;
		color: var(--text-primary);
		padding: 10px 12px;
		background: var(--bg-elevated, #1a1a24);
		border-radius: 8px;
		border-left: 3px solid #22c55e;
		line-height: 1.4;
	}

	/* Manual entry form */
	.form-section {
		margin-top: 0.5rem;
		margin-bottom: 1rem;
	}

	.log-btn {
		width: 100%;
		padding: 12px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text-primary);
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.log-btn:active {
		background: var(--bg-elevated, #1a1a24);
	}

	.log-form {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1rem;
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.form-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.form-row label {
		font-size: 0.75rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 500;
	}

	.form-row input {
		background: var(--bg-elevated, #1a1a24);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 10px 12px;
		color: var(--text-primary);
		font-size: 0.95rem;
		font-variant-numeric: tabular-nums;
	}

	.form-row input::placeholder {
		color: var(--text-secondary);
		opacity: 0.5;
	}

	.form-error {
		color: #ef4444;
		font-size: 0.8rem;
	}

	.form-success {
		color: #22c55e;
		font-size: 0.8rem;
	}

	.submit-btn {
		padding: 12px;
		background: var(--accent);
		border: none;
		border-radius: 10px;
		color: var(--text-primary);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Empty state */
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
