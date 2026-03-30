<script lang="ts">
	import { api } from '$lib/api';
	import type { Streak, StreakHistoryDay } from '$lib/api';

	let { streak }: { streak: Streak } = $props();

	let expanded = $state(false);
	let history = $state<StreakHistoryDay[]>([]);
	let historyLoading = $state(false);

	const STREAK_META: Record<string, { icon: string; label: string }> = {
		supplements: { icon: '\uD83D\uDC8A', label: 'Supplements taken daily' },
		cooking: { icon: '\uD83C\uDF73', label: 'Cooked a meal at home' },
		steps_goal: { icon: '\uD83D\uDC5F', label: 'Hit step goal' },
		water_goal: { icon: '\uD83D\uDCA7', label: 'Hit water goal' },
		sleep_target: { icon: '\uD83D\uDE34', label: 'Hit sleep target' },
		exercise: { icon: '\uD83D\uDCAA', label: 'Logged exercise' },
	};

	const meta = $derived(STREAK_META[streak.type] ?? { icon: '\uD83D\uDD25', label: streak.type });

	async function toggle() {
		expanded = !expanded;
		if (expanded && history.length === 0) {
			historyLoading = true;
			history = await api.streaks.history(streak.type, 30);
			historyLoading = false;
		}
	}

	function dayClass(day: StreakHistoryDay): string {
		return day.completed ? 'day completed' : 'day missed';
	}

	function dayLabel(day: StreakHistoryDay): string {
		const d = new Date(day.date + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="streak-card"
	class:active={streak.currentStreak > 0}
	onclick={toggle}
	onkeydown={(e) => e.key === 'Enter' && toggle()}
	role="button"
	tabindex={0}
>
	<div class="streak-header">
		<span class="streak-icon">{meta.icon}</span>
		<div class="streak-info">
			<span class="streak-count">
				{#if streak.currentStreak > 0}
					<span class="fire">{'\uD83D\uDD25'}</span>
				{/if}
				{streak.currentStreak} day{streak.currentStreak === 1 ? '' : 's'}
			</span>
			<span class="streak-label">{meta.label}</span>
		</div>
		{#if streak.longestStreak > 0}
			<span class="streak-best" title="Longest streak">Best: {streak.longestStreak}d</span>
		{/if}
	</div>

	{#if expanded}
		<div class="streak-detail">
			{#if historyLoading}
				<div class="skeleton" style="height: 60px; width: 100%;"></div>
			{:else if history.length > 0}
				<div class="heatmap">
					{#each history as day}
						<div class={dayClass(day)} title="{dayLabel(day)}: {day.completed ? 'done' : 'missed'}"></div>
					{/each}
				</div>
				<div class="heatmap-legend">
					<span class="legend-label">30 days ago</span>
					<span class="legend-label">Today</span>
				</div>
			{:else}
				<p class="no-data">No history data available.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.streak-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		cursor: pointer;
		transition: border-color 0.2s, transform 150ms ease;
	}

	.streak-card:active {
		transform: scale(0.98);
	}

	.streak-card.active {
		border-color: #f59e0b30;
	}

	.streak-header {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.streak-icon {
		font-size: 1.4rem;
		line-height: 1;
	}

	.streak-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.streak-count {
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}

	.fire {
		font-size: 0.9rem;
	}

	.streak-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
	}

	.streak-best {
		font-size: 0.65rem;
		color: var(--text-secondary);
		opacity: 0.7;
		white-space: nowrap;
	}

	.streak-detail {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}

	.heatmap {
		display: grid;
		grid-template-columns: repeat(15, 1fr);
		gap: 3px;
	}

	.day {
		aspect-ratio: 1;
		border-radius: 3px;
		min-width: 0;
	}

	.day.completed {
		background: #22c55e;
	}

	.day.missed {
		background: var(--bg-elevated);
	}

	.heatmap-legend {
		display: flex;
		justify-content: space-between;
		margin-top: 4px;
	}

	.legend-label {
		font-size: 0.55rem;
		color: var(--text-secondary);
		opacity: 0.6;
	}

	.no-data {
		font-size: 0.8rem;
		color: var(--text-secondary);
		text-align: center;
		padding: 0.5rem 0;
	}
</style>
