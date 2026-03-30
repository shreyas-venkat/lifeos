<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { WeeklyReport } from '$lib/api';

	let currentReport = $state<WeeklyReport | null>(null);
	let previousReport = $state<WeeklyReport | null>(null);
	let historyReports = $state<WeeklyReport[]>([]);
	let loading = $state(true);
	let expandedWeek = $state<string | null>(null);

	function delta(current: number | null, previous: number | null): { value: number; direction: 'up' | 'down' | 'flat' } {
		if (current === null || previous === null) return { value: 0, direction: 'flat' };
		const diff = current - previous;
		if (Math.abs(diff) < 0.01) return { value: 0, direction: 'flat' };
		return { value: Math.abs(diff), direction: diff > 0 ? 'up' : 'down' };
	}

	function formatDelta(d: { value: number; direction: string }, unit = '', decimals = 0): string {
		if (d.direction === 'flat') return '--';
		const arrow = d.direction === 'up' ? '\u2191' : '\u2193';
		const formatted = decimals > 0 ? d.value.toFixed(decimals) : Math.round(d.value).toLocaleString();
		return `${arrow} ${formatted}${unit}`;
	}

	/** Steps up = good, weight down = good, etc. */
	function trendClass(metric: string, direction: string): string {
		if (direction === 'flat') return 'trend-neutral';
		const goodIfUp = ['steps', 'sleep', 'adherence', 'cooked', 'sessions'];
		const goodIfDown = ['weight', 'skipped'];
		if (goodIfUp.includes(metric) && direction === 'up') return 'trend-good';
		if (goodIfUp.includes(metric) && direction === 'down') return 'trend-bad';
		if (goodIfDown.includes(metric) && direction === 'down') return 'trend-good';
		if (goodIfDown.includes(metric) && direction === 'up') return 'trend-bad';
		return 'trend-neutral';
	}

	function highlightType(text: string): 'win' | 'improve' {
		const improveKeywords = ['only', 'low', 'prioritize', 'try to', 'reminders'];
		const lower = text.toLowerCase();
		return improveKeywords.some((k) => lower.includes(k)) ? 'improve' : 'win';
	}

	function toggleHistory(week: string) {
		expandedWeek = expandedWeek === week ? null : week;
	}

	onMount(async () => {
		const [current, history] = await Promise.allSettled([
			api.weeklyReport.current(),
			api.weeklyReport.history(),
		]);

		if (current.status === 'fulfilled' && current.value) {
			currentReport = current.value;
		}
		if (history.status === 'fulfilled' && history.value.length > 0) {
			historyReports = history.value;
			// Second report in history = last week (index 1)
			if (history.value.length >= 2) {
				previousReport = history.value[1];
			}
		}
		loading = false;
	});
</script>

<svelte:head>
	<title>Weekly Report - LifeOS</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<h1>Weekly Report</h1>
		{#if currentReport}
			<span class="week-badge">{currentReport.week}</span>
		{/if}
	</div>

	{#if loading}
		<div class="skeleton-grid">
			<div class="skeleton" style="height: 120px;"></div>
			<div class="skeleton" style="height: 120px;"></div>
			<div class="skeleton" style="height: 80px;"></div>
			<div class="skeleton" style="height: 80px;"></div>
		</div>
	{:else if !currentReport}
		<div class="empty-state fade-in">
			<p>No report data available yet.</p>
			<p class="empty-hint">Reports generate from your health, meal, and supplement tracking data.</p>
		</div>
	{:else}
		<!-- Summary Stats -->
		<section class="summary-section fade-in">
			<h2 class="section-label">This Week</h2>
			<div class="stat-grid">
				<!-- Steps -->
				<div class="stat-card">
					<span class="stat-label">Avg Steps</span>
					<span class="stat-value">{currentReport.health.avg_steps?.toLocaleString() ?? '--'}</span>
					{#if previousReport}
						{@const d = delta(currentReport.health.avg_steps, previousReport.health.avg_steps)}
						<span class="stat-delta {trendClass('steps', d.direction)}">{formatDelta(d)}</span>
					{/if}
				</div>

				<!-- Sleep -->
				<div class="stat-card">
					<span class="stat-label">Avg Sleep</span>
					<span class="stat-value">{currentReport.health.avg_sleep !== null ? currentReport.health.avg_sleep.toFixed(1) + 'h' : '--'}</span>
					{#if previousReport}
						{@const d = delta(currentReport.health.avg_sleep, previousReport.health.avg_sleep)}
						<span class="stat-delta {trendClass('sleep', d.direction)}">{formatDelta(d, 'h', 1)}</span>
					{/if}
				</div>

				<!-- Weight -->
				<div class="stat-card">
					<span class="stat-label">Weight</span>
					<span class="stat-value">{currentReport.health.weight_change !== null ? (currentReport.health.weight_change > 0 ? '+' : '') + currentReport.health.weight_change.toFixed(1) + 'kg' : '--'}</span>
					{#if previousReport}
						{@const d = delta(currentReport.health.weight_change, previousReport.health.weight_change)}
						<span class="stat-delta {trendClass('weight', d.direction)}">{formatDelta(d, 'kg', 1)}</span>
					{/if}
				</div>

				<!-- Meals cooked -->
				<div class="stat-card">
					<span class="stat-label">Meals Cooked</span>
					<span class="stat-value">{currentReport.meals.cooked}</span>
					{#if previousReport}
						{@const d = delta(currentReport.meals.cooked, previousReport.meals.cooked)}
						<span class="stat-delta {trendClass('cooked', d.direction)}">{formatDelta(d)}</span>
					{/if}
				</div>

				<!-- Supplements -->
				<div class="stat-card">
					<span class="stat-label">Supplement %</span>
					<span class="stat-value">{currentReport.supplements.adherence_pct !== null ? currentReport.supplements.adherence_pct + '%' : '--'}</span>
					{#if previousReport}
						{@const d = delta(currentReport.supplements.adherence_pct, previousReport.supplements.adherence_pct)}
						<span class="stat-delta {trendClass('adherence', d.direction)}">{formatDelta(d, '%')}</span>
					{/if}
				</div>

				<!-- Exercise -->
				<div class="stat-card">
					<span class="stat-label">Exercise</span>
					<span class="stat-value">{currentReport.exercise.sessions} sessions</span>
					{#if previousReport}
						{@const d = delta(currentReport.exercise.sessions, previousReport.exercise.sessions)}
						<span class="stat-delta {trendClass('sessions', d.direction)}">{formatDelta(d)}</span>
					{/if}
				</div>
			</div>
		</section>

		<!-- Meal breakdown mini row -->
		<section class="detail-row fade-in">
			<div class="detail-chip">
				<span class="chip-label">Skipped</span>
				<span class="chip-value">{currentReport.meals.skipped}</span>
			</div>
			<div class="detail-chip">
				<span class="chip-label">Ate Out</span>
				<span class="chip-value">{currentReport.meals.ate_out}</span>
			</div>
			<div class="detail-chip">
				<span class="chip-label">Avg Cal</span>
				<span class="chip-value">{currentReport.meals.avg_calories?.toLocaleString() ?? '--'}</span>
			</div>
			<div class="detail-chip">
				<span class="chip-label">Avg HR</span>
				<span class="chip-value">{currentReport.health.avg_hr ?? '--'}</span>
			</div>
		</section>

		<!-- Highlights -->
		{#if currentReport.highlights.length > 0}
			<section class="highlights-section fade-in">
				<h2 class="section-label">Highlights</h2>
				<div class="highlights-list">
					{#each currentReport.highlights as highlight}
						{@const type = highlightType(highlight)}
						<div class="highlight-card {type}">
							<span class="highlight-icon">{type === 'win' ? '\u2713' : '!'}</span>
							<span class="highlight-text">{highlight}</span>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- History (last 4 weeks) -->
		{#if historyReports.length > 1}
			<section class="history-section fade-in">
				<h2 class="section-label">Previous Weeks</h2>
				<div class="history-list">
					{#each historyReports.slice(1) as report}
						<button
							class="history-card"
							class:expanded={expandedWeek === report.week}
							onclick={() => toggleHistory(report.week)}
						>
							<div class="history-header">
								<span class="history-week">{report.week}</span>
								<div class="history-pills">
									{#if report.health.avg_steps !== null}
										<span class="history-pill">{Math.round(report.health.avg_steps).toLocaleString()} steps</span>
									{/if}
									{#if report.supplements.adherence_pct !== null}
										<span class="history-pill">{report.supplements.adherence_pct}% supps</span>
									{/if}
								</div>
								<span class="expand-icon">{expandedWeek === report.week ? '\u25B2' : '\u25BC'}</span>
							</div>

							{#if expandedWeek === report.week}
								<div class="history-detail">
									<div class="history-stat-row">
										<span>Steps</span>
										<span>{report.health.avg_steps?.toLocaleString() ?? '--'}</span>
									</div>
									<div class="history-stat-row">
										<span>Sleep</span>
										<span>{report.health.avg_sleep !== null ? report.health.avg_sleep.toFixed(1) + 'h' : '--'}</span>
									</div>
									<div class="history-stat-row">
										<span>Weight</span>
										<span>{report.health.weight_change !== null ? (report.health.weight_change > 0 ? '+' : '') + report.health.weight_change.toFixed(1) + 'kg' : '--'}</span>
									</div>
									<div class="history-stat-row">
										<span>Meals cooked</span>
										<span>{report.meals.cooked}</span>
									</div>
									<div class="history-stat-row">
										<span>Avg calories</span>
										<span>{report.meals.avg_calories?.toLocaleString() ?? '--'}</span>
									</div>
									<div class="history-stat-row">
										<span>Exercise</span>
										<span>{report.exercise.sessions} sessions ({report.exercise.total_duration_min} min)</span>
									</div>
									{#if report.highlights.length > 0}
										<div class="history-highlights">
											{#each report.highlights as h}
												<span class="history-highlight-chip">{h}</span>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</button>
					{/each}
				</div>
			</section>
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

	.week-badge {
		background: var(--accent-glow);
		color: var(--accent);
		font-size: 0.75rem;
		font-weight: 600;
		padding: 4px 10px;
		border-radius: 20px;
		letter-spacing: 0.02em;
	}

	.section-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 500;
		margin-bottom: 0.75rem;
	}

	/* Summary Stats */
	.summary-section {
		margin-bottom: 1rem;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}

	@media (max-width: 400px) {
		.stat-grid {
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

	.stat-value {
		font-size: 1.35rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}

	.stat-delta {
		font-size: 0.7rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.stat-delta.trend-good { color: var(--success); }
	.stat-delta.trend-bad { color: var(--danger); }
	.stat-delta.trend-neutral { color: var(--text-secondary); }

	/* Detail row */
	.detail-row {
		display: flex;
		gap: 8px;
		margin-bottom: 1.25rem;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}
	.detail-row::-webkit-scrollbar { display: none; }

	.detail-chip {
		flex: 0 0 auto;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 8px 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 72px;
	}

	.chip-label {
		font-size: 0.6rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.chip-value {
		font-size: 0.95rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	/* Highlights */
	.highlights-section {
		margin-bottom: 1.25rem;
	}

	.highlights-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.highlight-card {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 10px;
		border-left: 3px solid;
	}

	.highlight-card.win {
		background: rgba(34, 197, 94, 0.08);
		border-left-color: var(--success);
	}

	.highlight-card.improve {
		background: rgba(245, 158, 11, 0.08);
		border-left-color: var(--warning);
	}

	.highlight-icon {
		font-size: 0.85rem;
		font-weight: 700;
		flex-shrink: 0;
		width: 20px;
		text-align: center;
	}

	.highlight-card.win .highlight-icon { color: var(--success); }
	.highlight-card.improve .highlight-icon { color: var(--warning); }

	.highlight-text {
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--text-primary);
	}

	/* History */
	.history-section {
		margin-bottom: 2rem;
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.history-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px 14px;
		width: 100%;
		text-align: left;
		color: var(--text-primary);
		transition: border-color 0.2s, transform 150ms ease;
	}

	.history-card:active {
		transform: scale(0.98);
	}

	.history-card.expanded {
		border-color: var(--accent);
	}

	.history-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.history-week {
		font-weight: 600;
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
	}

	.history-pills {
		display: flex;
		gap: 6px;
		flex: 1;
		justify-content: flex-end;
	}

	.history-pill {
		font-size: 0.65rem;
		color: var(--text-secondary);
		background: var(--bg-elevated);
		padding: 2px 8px;
		border-radius: 6px;
		font-variant-numeric: tabular-nums;
	}

	.expand-icon {
		font-size: 0.55rem;
		color: var(--text-secondary);
		opacity: 0.5;
		margin-left: 4px;
	}

	/* History detail (expanded) */
	.history-detail {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.history-stat-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
	}

	.history-stat-row span:first-child {
		color: var(--text-secondary);
	}

	.history-stat-row span:last-child {
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	.history-highlights {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
	}

	.history-highlight-chip {
		font-size: 0.7rem;
		color: var(--text-secondary);
		background: var(--bg-elevated);
		padding: 4px 10px;
		border-radius: 8px;
		line-height: 1.3;
	}

	/* Skeleton */
	.skeleton-grid {
		display: flex;
		flex-direction: column;
		gap: 12px;
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
