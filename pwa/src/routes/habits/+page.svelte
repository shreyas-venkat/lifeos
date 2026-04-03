<script lang="ts">
	import { onMount } from 'svelte';
	import { api, localDateStr } from '$lib/api';
	import type { Habit, HabitHistoryEntry } from '$lib/api';

	let habits = $state<Habit[]>([]);
	let historyEntries = $state<HabitHistoryEntry[]>([]);
	let loading = $state(true);

	// Add form state
	let showAddForm = $state(false);
	let addForm = $state({
		name: '',
		description: '',
		frequency: 'daily' as string,
		target_per_day: 1,
		color: '#6366f1',
		icon: '\u2713',
	});
	let addSubmitting = $state(false);

	const PRESET_COLORS = [
		'#6366f1', '#ef4444', '#f59e0b', '#22c55e', '#8b5cf6',
		'#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
	];

	const PRESET_ICONS = [
		'\u2713', '\u{1F9D8}', '\u{1F4D6}', '\u{1F3CB}\uFE0F', '\u{1F4A7}',
		'\u{1F34E}', '\u{1F4DD}', '\u{1F3B5}', '\u{1F6B6}', '\u{1F4A4}',
		'\u{1F9F9}', '\u{1F52C}', '\u{1F3A8}', '\u2615', '\u{1F680}',
	];

	const completed = $derived(habits.filter((h) => h.completed >= h.target_per_day).length);
	const total = $derived(habits.length);

	// 30-day grid data: group history by habit
	interface GridHabit {
		id: string;
		name: string;
		color: string;
		icon: string;
		target_per_day: number;
		days: Map<string, number>;
		completionPct: number;
	}

	const gridDays = $derived(getLast30Days());
	const gridHabits = $derived(buildGrid(historyEntries));

	function getLast30Days(): string[] {
		const days: string[] = [];
		const now = new Date();
		for (let i = 29; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			days.push(localDateStr(d));
		}
		return days;
	}

	function buildGrid(entries: HabitHistoryEntry[]): GridHabit[] {
		const map = new Map<string, GridHabit>();

		for (const e of entries) {
			if (!map.has(e.id)) {
				map.set(e.id, {
					id: e.id,
					name: e.name,
					color: e.color,
					icon: e.icon,
					target_per_day: e.target_per_day,
					days: new Map(),
					completionPct: 0,
				});
			}
			if (e.log_date) {
				map.get(e.id)!.days.set(e.log_date, e.completed);
			}
		}

		// Calculate completion percentage
		for (const gh of map.values()) {
			let completedDays = 0;
			for (const day of gridDays) {
				const c = gh.days.get(day) ?? 0;
				if (c >= gh.target_per_day) completedDays++;
			}
			gh.completionPct = gridDays.length > 0 ? Math.round((completedDays / gridDays.length) * 100) : 0;
		}

		return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
	}

	function getCellOpacity(gh: GridHabit, day: string): number {
		const c = gh.days.get(day) ?? 0;
		if (c === 0) return 0;
		return Math.min(c / gh.target_per_day, 1);
	}

	onMount(async () => {
		const [h, hist] = await Promise.allSettled([
			api.habits.list(),
			api.habits.history(30),
		]);
		if (h.status === 'fulfilled') habits = h.value;
		if (hist.status === 'fulfilled') historyEntries = hist.value;
		loading = false;
	});

	async function completeHabit(habit: Habit) {
		try {
			const result = await api.habits.complete(habit.id);
			habit.completed = result.completed;
			habits = [...habits];
		} catch {
			// Keep current state
		}
	}

	async function deleteHabit(id: string) {
		try {
			await api.habits.remove(id);
			habits = habits.filter((h) => h.id !== id);
			historyEntries = historyEntries.filter((e) => e.id !== id);
		} catch {
			// Delete failed
		}
	}

	async function submitAdd() {
		if (addSubmitting || !addForm.name.trim()) return;
		addSubmitting = true;
		try {
			await api.habits.create({
				name: addForm.name.trim(),
				description: addForm.description.trim() || undefined,
				frequency: addForm.frequency,
				target_per_day: addForm.target_per_day,
				color: addForm.color,
				icon: addForm.icon,
			});
			const [h, hist] = await Promise.allSettled([
				api.habits.list(),
				api.habits.history(30),
			]);
			if (h.status === 'fulfilled') habits = h.value;
			if (hist.status === 'fulfilled') historyEntries = hist.value;
			showAddForm = false;
			addForm = { name: '', description: '', frequency: 'daily', target_per_day: 1, color: '#6366f1', icon: '\u2713' };
		} catch {
			// Submit failed
		} finally {
			addSubmitting = false;
		}
	}

	function formatDayLabel(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { weekday: 'narrow' });
	}

	function formatDayNumber(dateStr: string): string {
		return dateStr.split('-')[2];
	}
</script>

<svelte:head>
	<title>Habits - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Habits</h1>

	{#if loading}
		<div class="skeleton" style="height: 16px; width: 120px; border-radius: 4px; margin-bottom: 1rem;"></div>
		{#each Array(3) as _}
			<div class="skeleton-habit">
				<div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
					<div class="skeleton" style="height: 14px; width: 50%; border-radius: 4px;"></div>
					<div class="skeleton" style="height: 10px; width: 30%; border-radius: 4px;"></div>
				</div>
				<div class="skeleton" style="width: 36px; height: 36px; border-radius: 50%;"></div>
			</div>
		{/each}
	{:else if total === 0 && !showAddForm}
		<div class="empty-state fade-in">
			<p>No habits tracked yet.</p>
			<p class="empty-hint">Tap + to create your first habit.</p>
		</div>
	{:else}
		<!-- Summary -->
		<div class="summary fade-in">
			<span class="summary-count">{completed}/{total}</span>
			<span class="summary-label">completed today</span>
		</div>

		<!-- Today's habits -->
		<div class="habit-list fade-in">
			{#each habits as habit}
				<div
					class="habit-item"
					class:habit-done={habit.completed >= habit.target_per_day}
					style="border-left-color: {habit.color};"
				>
					<button class="habit-tap-area" onclick={() => completeHabit(habit)}>
						<span class="habit-icon">{habit.icon}</span>
						<div class="habit-info">
							<span class="habit-name">{habit.name}</span>
							<span class="habit-progress">
								{habit.completed}/{habit.target_per_day} completed
							</span>
						</div>
					</button>
					<div class="habit-actions">
						<div class="completion-indicator" class:done={habit.completed >= habit.target_per_day}>
							{#if habit.completed >= habit.target_per_day}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="20 6 9 17 4 12" />
								</svg>
							{:else}
								<span class="progress-text">{habit.completed}</span>
							{/if}
						</div>
						<button
							class="delete-btn"
							onclick={() => deleteHabit(habit.id)}
							title="Remove habit"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				</div>
			{/each}
		</div>

		<!-- 30-day contribution grid -->
		{#if gridHabits.length > 0}
			<div class="section-header fade-in">
				<span class="section-label">30-day history</span>
				<div class="section-divider"></div>
			</div>

			<div class="grid-container fade-in">
				{#each gridHabits as gh}
					<div class="grid-row">
						<div class="grid-habit-label">
							<span class="grid-icon">{gh.icon}</span>
							<span class="grid-name">{gh.name}</span>
							<span class="grid-pct">{gh.completionPct}%</span>
						</div>
						<div class="grid-cells">
							{#each gridDays as day}
								{@const opacity = getCellOpacity(gh, day)}
								<div
									class="grid-cell"
									style="background: {opacity > 0 ? gh.color : 'var(--bg-elevated)'}; opacity: {opacity > 0 ? 0.3 + opacity * 0.7 : 1};"
									title="{day}: {gh.days.get(day) ?? 0}/{gh.target_per_day}"
								></div>
							{/each}
						</div>
					</div>
				{/each}
				<!-- Day labels row -->
				<div class="grid-day-labels">
					<div class="grid-habit-label"></div>
					<div class="grid-cells">
						{#each gridDays as day, i}
							{#if i % 5 === 0}
								<div class="grid-day-label">{formatDayNumber(day)}</div>
							{:else}
								<div class="grid-day-label"></div>
							{/if}
						{/each}
					</div>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Add Form Overlay -->
	{#if showAddForm}
		<div class="form-overlay fade-in" role="dialog">
			<div class="form-card">
				<div class="form-header">
					<h3>New Habit</h3>
					<button class="form-close" onclick={() => (showAddForm = false)} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<form onsubmit={(e) => { e.preventDefault(); submitAdd(); }}>
					<label class="form-field">
						<span>Name</span>
						<input type="text" bind:value={addForm.name} placeholder="e.g. Meditate" required />
					</label>
					<label class="form-field">
						<span>Description (optional)</span>
						<input type="text" bind:value={addForm.description} placeholder="e.g. 10 min morning session" />
					</label>
					<div class="form-row">
						<label class="form-field">
							<span>Frequency</span>
							<select bind:value={addForm.frequency}>
								<option value="daily">Daily</option>
								<option value="weekly">Weekly</option>
							</select>
						</label>
						<label class="form-field">
							<span>Target / day</span>
							<input type="number" bind:value={addForm.target_per_day} min="1" max="20" />
						</label>
					</div>

					<!-- Color picker -->
					<div class="form-field">
						<span>Color</span>
						<div class="color-picker">
							{#each PRESET_COLORS as c}
								<button
									type="button"
									class="color-swatch"
									class:selected={addForm.color === c}
									style="background: {c};"
									onclick={() => (addForm.color = c)}
									aria-label="Color {c}"
								></button>
							{/each}
						</div>
					</div>

					<!-- Icon picker -->
					<div class="form-field">
						<span>Icon</span>
						<div class="icon-picker">
							{#each PRESET_ICONS as ic}
								<button
									type="button"
									class="icon-option"
									class:selected={addForm.icon === ic}
									onclick={() => (addForm.icon = ic)}
								>{ic}</button>
							{/each}
						</div>
					</div>

					<button type="submit" class="form-submit" disabled={addSubmitting}>
						{addSubmitting ? 'Creating...' : 'Create Habit'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- FAB "+" -->
	<button class="fab" onclick={() => (showAddForm = true)} aria-label="Add habit">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	</button>
</div>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 1.25rem;
	}

	/* Summary */
	.summary {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 1.25rem;
	}

	.summary-count {
		font-size: 1.8rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.summary-label {
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	/* Habit list */
	.habit-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.habit-item {
		display: flex;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		border: 1px solid var(--border);
		border-left: 4px solid;
		transition: opacity 0.2s, border-color 0.2s, transform 150ms ease;
	}

	.habit-item:active {
		transform: scale(0.98);
	}

	.habit-item.habit-done {
		opacity: 0.6;
	}

	.habit-tap-area {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		padding: 14px;
		background: none;
		border: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
		min-width: 0;
	}

	.habit-icon {
		font-size: 1.3rem;
		flex-shrink: 0;
		width: 28px;
		text-align: center;
	}

	.habit-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.habit-name {
		font-size: 0.95rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.habit-progress {
		font-size: 0.78rem;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.habit-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-right: 12px;
	}

	.completion-indicator {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.2s;
	}

	.completion-indicator.done {
		background: var(--success);
		border-color: var(--success);
	}

	.completion-indicator.done svg {
		width: 18px;
		height: 18px;
		color: white;
	}

	.progress-text {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.delete-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: none;
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-secondary);
		transition: color 0.2s, border-color 0.2s;
		flex-shrink: 0;
	}

	.delete-btn:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	.delete-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Section header */
	.section-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
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

	/* Contribution grid */
	.grid-container {
		display: flex;
		flex-direction: column;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.grid-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.grid-habit-label {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 110px;
		max-width: 110px;
		overflow: hidden;
	}

	.grid-icon {
		font-size: 0.8rem;
		flex-shrink: 0;
	}

	.grid-name {
		font-size: 0.7rem;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.grid-pct {
		font-size: 0.65rem;
		color: var(--text-secondary);
		font-weight: 600;
		margin-left: auto;
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.grid-cells {
		display: flex;
		gap: 2px;
		flex: 1;
	}

	.grid-cell {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.grid-day-labels {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.grid-day-label {
		width: 10px;
		font-size: 0.55rem;
		color: var(--text-secondary);
		text-align: center;
		flex-shrink: 0;
	}

	/* Form overlay */
	.form-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 100;
		padding: 0 0 env(safe-area-inset-bottom, 0);
	}

	.form-card {
		background: var(--bg-card);
		border-radius: 16px 16px 0 0;
		padding: 20px 20px 80px;
		width: 100%;
		max-width: 500px;
		max-height: 85vh;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-bottom: none;
	}

	.form-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.form-header h3 {
		font-size: 1.1rem;
		font-weight: 600;
	}

	.form-close {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-secondary);
	}

	.form-close svg {
		width: 16px;
		height: 16px;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
		flex: 1;
	}

	.form-field span {
		font-size: 0.75rem;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.form-field input,
	.form-field select {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 12px;
		color: var(--text-primary);
		font-size: 0.9rem;
	}

	.form-field input:focus,
	.form-field select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.form-row {
		display: flex;
		gap: 10px;
	}

	/* Color picker */
	.color-picker {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.color-swatch {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: border-color 0.2s, transform 0.2s;
	}

	.color-swatch.selected {
		border-color: var(--text-primary);
		transform: scale(1.15);
	}

	.color-swatch:hover:not(.selected) {
		transform: scale(1.1);
	}

	/* Icon picker */
	.icon-picker {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.icon-option {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: var(--bg-elevated);
		border: 2px solid transparent;
		font-size: 1.1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: border-color 0.2s, background 0.2s;
	}

	.icon-option.selected {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.icon-option:hover:not(.selected) {
		background: var(--border);
	}

	.form-submit {
		width: 100%;
		background: var(--accent);
		color: white;
		border: none;
		border-radius: 10px;
		padding: 12px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		margin-top: 4px;
		transition: opacity 0.2s;
	}

	.form-submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-submit:hover:not(:disabled) {
		opacity: 0.9;
	}

	/* FAB */
	.fab {
		position: fixed;
		bottom: 72px;
		right: 20px;
		width: 52px;
		height: 52px;
		background: var(--accent);
		border-radius: 16px;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
		transition: transform 0.2s;
		z-index: 50;
	}

	.fab:hover {
		transform: scale(1.05);
	}

	.fab svg {
		width: 22px;
		height: 22px;
		color: white;
	}

	/* Skeleton */
	.skeleton-habit {
		display: flex;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		margin-bottom: 8px;
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
