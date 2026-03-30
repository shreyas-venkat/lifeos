<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { UsageSummary } from '$lib/api';

	let loading = $state(true);
	let period = $state<'today' | 'week' | 'month'>('today');
	let data = $state<UsageSummary | null>(null);

	const periodLabels: Record<string, string> = {
		today: 'Today',
		week: '7D',
		month: '30D',
	};

	const maxTaskCost = $derived(
		data && data.byTask.length > 0
			? Math.max(...data.byTask.map((t) => t.cost))
			: 0,
	);

	const maxDailyCost = $derived(
		data && data.daily.length > 0
			? Math.max(...data.daily.map((d) => d.cost))
			: 0,
	);

	const hasData = $derived(
		data !== null && data.totals.total_requests > 0,
	);

	function formatCost(usd: number): string {
		if (usd < 0.01) return `$${usd.toFixed(4)}`;
		return `$${usd.toFixed(2)}`;
	}

	function formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function taskLabel(id: string | null): string {
		if (!id) return 'Conversations';
		return id.replace(/^lifeos-/, '').replace(/-/g, ' ');
	}

	async function fetchData() {
		loading = true;
		data = await api.usage.summary(period);
		loading = false;
	}

	function setPeriod(p: 'today' | 'week' | 'month') {
		period = p;
		fetchData();
	}

	onMount(() => {
		fetchData();
	});
</script>

<svelte:head>
	<title>Usage - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>API Usage</h1>

	<!-- Period Toggle -->
	<div class="toggle-row fade-in">
		{#each (['today', 'week', 'month'] as const) as p}
			<button
				class="toggle-btn"
				class:active={period === p}
				onclick={() => setPeriod(p)}
			>
				{periodLabels[p]}
			</button>
		{/each}
	</div>

	{#if loading}
		<div class="skeleton" style="height: 80px; border-radius: 12px; margin-bottom: 1rem;"></div>
		<div class="skeleton" style="height: 16px; width: 100px; border-radius: 4px; margin-bottom: 0.75rem;"></div>
		{#each Array(3) as _}
			<div class="skeleton-item">
				<div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
					<div class="skeleton" style="height: 14px; width: 55%; border-radius: 4px;"></div>
					<div class="skeleton" style="height: 10px; width: 35%; border-radius: 4px;"></div>
				</div>
				<div class="skeleton" style="width: 60px; height: 14px; border-radius: 4px;"></div>
			</div>
		{/each}
	{:else if !hasData}
		<div class="empty-state fade-in">
			<div class="empty-icon">$</div>
			<p>No API usage tracked yet.</p>
			<p class="empty-hint">Usage data appears here after scheduled tasks or conversations run.</p>
		</div>
	{:else if data}
		<!-- Totals Card -->
		<div class="totals-card fade-in">
			<div class="totals-main">
				<span class="totals-cost">{formatCost(data.totals.total_cost)}</span>
				<span class="totals-label">total cost</span>
			</div>
			<div class="totals-stats">
				<div class="stat">
					<span class="stat-value">{formatTokens(data.totals.total_input_tokens)}</span>
					<span class="stat-label">input</span>
				</div>
				<div class="stat">
					<span class="stat-value">{formatTokens(data.totals.total_output_tokens)}</span>
					<span class="stat-label">output</span>
				</div>
				<div class="stat">
					<span class="stat-value">{data.totals.total_requests}</span>
					<span class="stat-label">requests</span>
				</div>
			</div>
		</div>

		<!-- By Model -->
		{#if data.byModel.length > 0}
			<div class="section-header fade-in">
				<span class="section-label">By Model</span>
				<div class="section-divider"></div>
			</div>
			<div class="model-list fade-in">
				{#each data.byModel as m}
					<div class="model-item">
						<span class="model-name">{m.model || 'Unknown'}</span>
						<div class="model-stats">
							<span class="model-cost">{formatCost(m.cost)}</span>
							<span class="model-tokens">{formatTokens(m.input_tokens + m.output_tokens)} tok</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- By Task -->
		{#if data.byTask.length > 0}
			<div class="section-header fade-in">
				<span class="section-label">By Task</span>
				<div class="section-divider"></div>
			</div>
			<div class="task-list fade-in">
				{#each data.byTask as t}
					<div class="task-item">
						<div class="task-left">
							<span class="task-name">{taskLabel(t.task_id)}</span>
							<span class="task-count">{t.requests} request{t.requests !== 1 ? 's' : ''}</span>
						</div>
						<div class="task-right">
							<span class="task-cost">{formatCost(t.cost)}</span>
							<div class="task-bar-track">
								<div
									class="task-bar-fill"
									style="width: {maxTaskCost > 0 ? (t.cost / maxTaskCost) * 100 : 0}%;"
								></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Daily Trend -->
		{#if data.daily.length > 1}
			<div class="section-header fade-in">
				<span class="section-label">Daily Trend</span>
				<div class="section-divider"></div>
			</div>
			<div class="chart-container fade-in">
				<div class="bar-chart">
					{#each data.daily as d}
						<div class="bar-col">
							<div class="bar-value">{formatCost(d.cost)}</div>
							<div class="bar-track">
								<div
									class="bar-fill"
									style="height: {maxDailyCost > 0 ? (d.cost / maxDailyCost) * 100 : 0}%;"
								></div>
							</div>
							<div class="bar-label">{formatDate(d.date)}</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 1.25rem;
	}

	/* Period toggle */
	.toggle-row {
		display: flex;
		gap: 6px;
		margin-bottom: 1.25rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 4px;
	}

	.toggle-btn {
		flex: 1;
		padding: 8px 12px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.toggle-btn.active {
		background: var(--accent);
		color: white;
	}

	/* Totals card */
	.totals-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 20px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 16px;
		margin-bottom: 1.25rem;
	}

	.totals-main {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.totals-cost {
		font-size: 2rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.totals-label {
		font-size: 0.8rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.totals-stats {
		display: flex;
		gap: 24px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-value {
		font-size: 1rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.stat-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* Section headers */
	.section-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 1.25rem;
		margin-bottom: 0.5rem;
	}

	.section-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		white-space: nowrap;
	}

	.section-divider {
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	/* Model list */
	.model-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.model-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 12px 14px;
		border: 1px solid var(--border);
	}

	.model-name {
		font-size: 0.9rem;
		font-weight: 600;
	}

	.model-stats {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}

	.model-cost {
		font-size: 0.9rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.model-tokens {
		font-size: 0.72rem;
		color: var(--text-secondary);
	}

	/* Task list */
	.task-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.task-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 12px 14px;
		border: 1px solid var(--border);
	}

	.task-left {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.task-name {
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.task-count {
		font-size: 0.72rem;
		color: var(--text-secondary);
	}

	.task-right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
		min-width: 100px;
	}

	.task-cost {
		font-size: 0.9rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.task-bar-track {
		width: 100%;
		height: 4px;
		background: var(--bg-elevated);
		border-radius: 2px;
		overflow: hidden;
	}

	.task-bar-fill {
		height: 100%;
		border-radius: 2px;
		background: var(--accent);
		transition: width 0.6s ease;
	}

	/* Bar chart */
	.chart-container {
		padding: 16px 0;
	}

	.bar-chart {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		height: 160px;
	}

	.bar-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
	}

	.bar-value {
		font-size: 0.65rem;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
		margin-bottom: 4px;
		white-space: nowrap;
	}

	.bar-track {
		flex: 1;
		width: 100%;
		max-width: 36px;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		background: var(--bg-elevated);
		border-radius: 6px 6px 0 0;
		overflow: hidden;
	}

	.bar-fill {
		width: 100%;
		background: var(--accent);
		border-radius: 6px 6px 0 0;
		transition: height 0.6s ease;
		min-height: 2px;
	}

	.bar-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		margin-top: 6px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* Empty state */
	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--text-secondary);
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 0.75rem;
		font-weight: 700;
		opacity: 0.4;
	}

	.empty-hint {
		font-size: 0.85rem;
		margin-top: 0.5rem;
		opacity: 0.7;
		max-width: 280px;
		margin-left: auto;
		margin-right: auto;
	}

	/* Skeleton */
	.skeleton-item {
		display: flex;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		margin-bottom: 8px;
	}
</style>
