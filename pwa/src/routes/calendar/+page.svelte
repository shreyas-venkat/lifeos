<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { CalendarEvent } from '$lib/api';

	let todayEvents = $state<CalendarEvent[]>([]);
	let weekEvents = $state<CalendarEvent[]>([]);
	let loading = $state(true);

	// Group week events by day (excluding today)
	const dayGroups = $derived(groupByDay(weekEvents));

	interface DayGroup {
		label: string;
		dateKey: string;
		events: CalendarEvent[];
	}

	// Convert UTC ISO string to Mountain Time date string (YYYY-MM-DD)
	function toMountainDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
	}

	function groupByDay(events: CalendarEvent[]): DayGroup[] {
		const todayStr = toMountainDate(new Date().toISOString());
		const groups = new Map<string, CalendarEvent[]>();

		for (const e of events) {
			const dateKey = toMountainDate(e.startTime);
			if (dateKey === todayStr) continue;
			if (!groups.has(dateKey)) groups.set(dateKey, []);
			groups.get(dateKey)!.push(e);
		}

		const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
		return sorted.map(([dateKey, evts]) => ({
			label: formatDayHeader(dateKey),
			dateKey,
			events: evts.sort(
				(a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
			),
		}));
	}

	function formatDayHeader(dateStr: string): string {
		// dateStr is YYYY-MM-DD in Mountain Time
		const tomorrowStr = (() => {
			const t = new Date();
			t.setDate(t.getDate() + 1);
			return toMountainDate(t.toISOString());
		})();

		if (dateStr === tomorrowStr) return 'Tomorrow';

		// Parse as local date (noon to avoid DST edge cases)
		const d = new Date(dateStr + 'T12:00:00');
		return d.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
		});
	}

	function formatTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
			timeZone: 'America/Edmonton',
		});
	}

	function formatTimeRange(start: string, end?: string): string {
		const s = formatTime(start);
		if (!end) return s;
		return `${s} - ${formatTime(end)}`;
	}

	function isCookEvent(title: string): boolean {
		return title.toLowerCase().includes('cook');
	}

	onMount(async () => {
		const [t, w] = await Promise.allSettled([api.calendar.today(), api.calendar.week()]);
		if (t.status === 'fulfilled') todayEvents = t.value;
		if (w.status === 'fulfilled') weekEvents = w.value;
		loading = false;
	});
</script>

<svelte:head>
	<title>Calendar - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Calendar</h1>

	{#if loading}
		<div class="section-header">
			<span class="section-label">Today</span>
			<div class="section-divider"></div>
		</div>
		{#each Array(3) as _}
			<div class="skeleton-item">
				<div class="skeleton" style="height: 12px; width: 60px; border-radius: 4px;"></div>
				<div style="flex: 1; display: flex; flex-direction: column; gap: 4px; margin-left: 12px;">
					<div class="skeleton" style="height: 14px; width: 70%; border-radius: 4px;"></div>
					<div class="skeleton" style="height: 10px; width: 40%; border-radius: 4px;"></div>
				</div>
			</div>
		{/each}
	{:else}
		<!-- Today's Events -->
		<div class="section-header fade-in">
			<span class="section-label">Today</span>
			<div class="section-divider"></div>
		</div>

		{#if todayEvents.length === 0}
			<div class="empty-today fade-in">No events today.</div>
		{:else}
			<div class="event-list fade-in">
				{#each todayEvents as evt}
					<div class="event-card" class:cook-event={isCookEvent(evt.title)}>
						<div class="event-time">
							{formatTimeRange(evt.startTime, evt.endTime)}
						</div>
						<div class="event-details">
							<span class="event-title">{evt.title}</span>
							{#if evt.location}
								<span class="event-location">{evt.location}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Week Events -->
		{#if dayGroups.length > 0}
			{#each dayGroups as group (group.dateKey)}
				<div class="section-header fade-in" style="margin-top: 1.25rem;">
					<span class="section-label">{group.label}</span>
					<div class="section-divider"></div>
				</div>
				<div class="event-list fade-in">
					{#each group.events as evt}
						<div class="event-card" class:cook-event={isCookEvent(evt.title)}>
							<div class="event-time">
								{formatTimeRange(evt.startTime, evt.endTime)}
							</div>
							<div class="event-details">
								<span class="event-title">{evt.title}</span>
								{#if evt.location}
									<span class="event-location">{evt.location}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/each}
		{:else if todayEvents.length === 0}
			<div class="empty-state fade-in">
				<p>No upcoming events this week.</p>
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

	.section-header {
		display: flex;
		align-items: center;
		gap: 10px;
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

	.event-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.event-card {
		display: flex;
		align-items: flex-start;
		background: var(--bg-card);
		border-radius: 10px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		gap: 12px;
	}

	.event-card.cook-event {
		border-left-color: var(--warning);
	}

	.event-time {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-secondary);
		min-width: 70px;
		flex-shrink: 0;
		padding-top: 1px;
		font-variant-numeric: tabular-nums;
	}

	.event-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.event-title {
		font-size: 0.9rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.event-location {
		font-size: 0.75rem;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty-today {
		text-align: center;
		padding: 1.5rem 1rem;
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.skeleton-item {
		display: flex;
		align-items: center;
		background: var(--bg-card);
		border-radius: 10px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		margin-bottom: 6px;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--text-secondary);
	}
</style>
