<script lang="ts">
	import { onMount } from 'svelte';
	import { api, localDateStr } from '$lib/api';
	import type { ExerciseLogEntry, ExerciseHistoryDay, ExerciseTemplate } from '$lib/api';

	let exercises = $state<ExerciseLogEntry[]>([]);
	let history = $state<ExerciseHistoryDay[]>([]);
	let templates = $state<ExerciseTemplate[]>([]);
	let loading = $state(true);

	// Form state
	let showLogForm = $state(false);
	let logSubmitting = $state(false);
	let mode = $state<'cardio' | 'strength'>('cardio');
	let logForm = $state({
		exercise_type: '',
		duration_min: undefined as number | undefined,
		sets: undefined as number | undefined,
		reps: undefined as number | undefined,
		weight_kg: undefined as number | undefined,
		distance_km: undefined as number | undefined,
		calories_burned: undefined as number | undefined,
		notes: '',
	});

	// Template form state
	let showTemplateForm = $state(false);
	let templateSubmitting = $state(false);
	let templateForm = $state({
		name: '',
		category: 'cardio' as string,
		default_sets: undefined as number | undefined,
		default_reps: undefined as number | undefined,
	});

	// History toggle
	let historyDays = $state(7);

	// Templates section
	let templatesExpanded = $state(false);

	// Stats
	const weekExercises = $derived(
		history
			.filter((d) => {
				const date = new Date(d.log_date);
				const now = new Date();
				const weekAgo = new Date(now);
				weekAgo.setDate(weekAgo.getDate() - 7);
				return date >= weekAgo;
			})
			.reduce((sum, d) => sum + d.exercise_count, 0)
	);

	const weekDuration = $derived(
		history
			.filter((d) => {
				const date = new Date(d.log_date);
				const now = new Date();
				const weekAgo = new Date(now);
				weekAgo.setDate(weekAgo.getDate() - 7);
				return date >= weekAgo;
			})
			.reduce((sum, d) => sum + (d.total_duration ?? 0), 0)
	);

	const streak = $derived(() => {
		if (history.length === 0) return 0;
		const sorted = [...history].sort(
			(a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
		);
		let count = 0;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		for (let i = 0; i < sorted.length; i++) {
			const expected = new Date(today);
			expected.setDate(expected.getDate() - i);
			const dateStr = localDateStr(expected);
			if (sorted.find((d) => d.log_date === dateStr)) {
				count++;
			} else {
				break;
			}
		}
		return count;
	});

	// Bar chart: max count for scaling
	const maxCount = $derived(
		Math.max(1, ...history.map((d) => d.exercise_count))
	);

	const categoryOptions = ['cardio', 'strength', 'flexibility', 'sports'];

	onMount(async () => {
		const [todayData, histData, tmplData] = await Promise.all([
			api.exercise.today(),
			api.exercise.history(historyDays),
			api.exercise.templates(),
		]);
		exercises = todayData;
		history = histData;
		templates = tmplData;
		loading = false;
	});

	async function refreshHistory() {
		history = await api.exercise.history(historyDays);
	}

	function selectTemplate(tmpl: ExerciseTemplate) {
		logForm.exercise_type = tmpl.name;
		if (tmpl.category === 'cardio' || tmpl.category === 'sports') {
			mode = 'cardio';
		} else {
			mode = 'strength';
			logForm.sets = tmpl.default_sets ?? undefined;
			logForm.reps = tmpl.default_reps ?? undefined;
		}
		showLogForm = true;
	}

	async function submitLog() {
		if (logSubmitting || !logForm.exercise_type.trim()) return;
		logSubmitting = true;
		try {
			await api.exercise.log({
				exercise_type: logForm.exercise_type.trim(),
				duration_min: mode === 'cardio' ? logForm.duration_min : undefined,
				sets: mode === 'strength' ? logForm.sets : undefined,
				reps: mode === 'strength' ? logForm.reps : undefined,
				weight_kg: mode === 'strength' ? logForm.weight_kg : undefined,
				distance_km: mode === 'cardio' ? logForm.distance_km : undefined,
				calories_burned: logForm.calories_burned,
				notes: logForm.notes || undefined,
			});
			exercises = await api.exercise.today();
			history = await api.exercise.history(historyDays);
			showLogForm = false;
			logForm = {
				exercise_type: '',
				duration_min: undefined,
				sets: undefined,
				reps: undefined,
				weight_kg: undefined,
				distance_km: undefined,
				calories_burned: undefined,
				notes: '',
			};
		} catch {
			// Submit failed
		} finally {
			logSubmitting = false;
		}
	}

	async function deleteExercise(id: string) {
		try {
			await api.exercise.remove(id);
			exercises = exercises.filter((e) => e.id !== id);
			history = await api.exercise.history(historyDays);
		} catch {
			// Delete failed
		}
	}

	async function submitTemplate() {
		if (templateSubmitting || !templateForm.name.trim()) return;
		templateSubmitting = true;
		try {
			await api.exercise.addTemplate({
				name: templateForm.name.trim(),
				category: templateForm.category,
				default_sets: templateForm.default_sets,
				default_reps: templateForm.default_reps,
			});
			templates = await api.exercise.templates();
			showTemplateForm = false;
			templateForm = {
				name: '',
				category: 'cardio',
				default_sets: undefined,
				default_reps: undefined,
			};
		} catch {
			// Submit failed
		} finally {
			templateSubmitting = false;
		}
	}

	function formatExercise(e: ExerciseLogEntry): string {
		if (e.duration_min) return `${e.duration_min} min`;
		if (e.sets && e.reps) {
			const w = e.weight_kg ? ` @ ${e.weight_kg}kg` : '';
			return `${e.sets}x${e.reps}${w}`;
		}
		return '';
	}
</script>

<svelte:head>
	<title>Exercise - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Exercise</h1>

	{#if loading}
		<div class="stats-row">
			{#each Array(3) as _}
				<div class="skeleton stat-skeleton"></div>
			{/each}
		</div>
		{#each Array(3) as _}
			<div class="skeleton-item">
				<div class="skeleton" style="height: 14px; width: 60%; border-radius: 4px;"></div>
				<div class="skeleton" style="height: 10px; width: 40%; border-radius: 4px;"></div>
			</div>
		{/each}
	{:else}
		<!-- Stats -->
		<div class="stats-row fade-in">
			<div class="stat-card">
				<span class="stat-value">{weekExercises}</span>
				<span class="stat-label">This Week</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">{weekDuration}<span class="stat-unit">min</span></span>
				<span class="stat-label">Duration</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">{streak()}</span>
				<span class="stat-label">Day Streak</span>
			</div>
		</div>

		<!-- Today's Workout -->
		<div class="section-header fade-in">
			<span class="section-label">Today's Workout</span>
			<div class="section-divider"></div>
		</div>

		{#if exercises.length === 0}
			<div class="empty-card fade-in">
				<p>No exercises logged today.</p>
				<p class="empty-hint">Tap + to log a workout.</p>
			</div>
		{:else}
			<div class="exercise-list fade-in">
				{#each exercises as ex}
					<div class="exercise-item">
						<div class="exercise-info">
							<span class="exercise-name">{ex.exercise_type}</span>
							<div class="exercise-details">
								<span>{formatExercise(ex)}</span>
								{#if ex.distance_km}
									<span>{ex.distance_km} km</span>
								{/if}
								{#if ex.calories_burned}
									<span>{ex.calories_burned} kcal</span>
								{/if}
							</div>
							{#if ex.notes}
								<span class="exercise-notes">{ex.notes}</span>
							{/if}
						</div>
						<button
							class="delete-btn"
							onclick={() => deleteExercise(ex.id)}
							title="Delete exercise"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<!-- History -->
		<div class="section-header fade-in" style="margin-top: 1.5rem;">
			<span class="section-label">History</span>
			<div class="section-divider"></div>
			<div class="toggle-group">
				<button
					class="toggle-btn"
					class:toggle-active={historyDays === 7}
					onclick={() => { historyDays = 7; refreshHistory(); }}
				>7D</button>
				<button
					class="toggle-btn"
					class:toggle-active={historyDays === 30}
					onclick={() => { historyDays = 30; refreshHistory(); }}
				>30D</button>
			</div>
		</div>

		{#if history.length === 0}
			<div class="empty-card fade-in">
				<p>No exercise history yet.</p>
			</div>
		{:else}
			<div class="chart-container fade-in">
				<div class="bar-chart">
					{#each history as day}
						<div class="bar-col">
							<div
								class="bar"
								style="height: {(day.exercise_count / maxCount) * 100}%;"
								title="{day.log_date}: {day.exercise_count} exercises"
							></div>
							<span class="bar-label">{new Date(day.log_date + 'T00:00:00').getDate()}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Templates -->
		<div class="section-header fade-in" style="margin-top: 1.5rem;">
			<button class="section-toggle" onclick={() => (templatesExpanded = !templatesExpanded)}>
				<span class="section-label">Templates</span>
				<svg
					class="chevron"
					class:chevron-open={templatesExpanded}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>
			<div class="section-divider"></div>
			<button
				class="add-template-btn"
				onclick={() => (showTemplateForm = true)}
				title="Add template"
			>+</button>
		</div>

		{#if templatesExpanded}
			{#if templates.length === 0}
				<div class="empty-card fade-in">
					<p>No templates saved yet.</p>
				</div>
			{:else}
				<div class="template-list fade-in">
					{#each categoryOptions as cat}
						{@const catTemplates = templates.filter((t) => t.category === cat)}
						{#if catTemplates.length > 0}
							<div class="template-category">
								<span class="template-cat-label">{cat}</span>
								{#each catTemplates as tmpl}
									<button
										class="template-item"
										onclick={() => selectTemplate(tmpl)}
									>
										<span class="template-name">{tmpl.name}</span>
										{#if tmpl.default_sets && tmpl.default_reps}
											<span class="template-defaults">{tmpl.default_sets}x{tmpl.default_reps}</span>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		{/if}
	{/if}

	<!-- Log Form Overlay -->
	{#if showLogForm}
		<div class="form-overlay fade-in" role="dialog">
			<div class="form-card">
				<div class="form-header">
					<h3>Log Exercise</h3>
					<button class="form-close" onclick={() => (showLogForm = false)} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<form onsubmit={(e) => { e.preventDefault(); submitLog(); }}>
					<label class="form-field">
						<span>Exercise Type</span>
						<input
							type="text"
							bind:value={logForm.exercise_type}
							placeholder="e.g. Running, Bench Press"
							list="exercise-types"
							required
						/>
						<datalist id="exercise-types">
							{#each templates as tmpl}
								<option value={tmpl.name}></option>
							{/each}
						</datalist>
					</label>

					<!-- Mode toggle -->
					<div class="mode-toggle">
						<button
							type="button"
							class="mode-btn"
							class:mode-active={mode === 'cardio'}
							onclick={() => (mode = 'cardio')}
						>Cardio</button>
						<button
							type="button"
							class="mode-btn"
							class:mode-active={mode === 'strength'}
							onclick={() => (mode = 'strength')}
						>Strength</button>
					</div>

					{#if mode === 'cardio'}
						<div class="form-row">
							<label class="form-field">
								<span>Duration (min)</span>
								<input type="number" bind:value={logForm.duration_min} min="0" step="1" />
							</label>
							<label class="form-field">
								<span>Distance (km)</span>
								<input type="number" bind:value={logForm.distance_km} min="0" step="0.1" />
							</label>
						</div>
					{:else}
						<div class="form-row">
							<label class="form-field">
								<span>Sets</span>
								<input type="number" bind:value={logForm.sets} min="0" step="1" />
							</label>
							<label class="form-field">
								<span>Reps</span>
								<input type="number" bind:value={logForm.reps} min="0" step="1" />
							</label>
							<label class="form-field">
								<span>Weight (kg)</span>
								<input type="number" bind:value={logForm.weight_kg} min="0" step="0.5" />
							</label>
						</div>
					{/if}

					<div class="form-row">
						<label class="form-field">
							<span>Calories Burned</span>
							<input type="number" bind:value={logForm.calories_burned} min="0" step="1" />
						</label>
					</div>

					<label class="form-field">
						<span>Notes</span>
						<input type="text" bind:value={logForm.notes} placeholder="Optional notes" />
					</label>

					<button type="submit" class="form-submit" disabled={logSubmitting}>
						{logSubmitting ? 'Logging...' : 'Log Exercise'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- Template Form Overlay -->
	{#if showTemplateForm}
		<div class="form-overlay fade-in" role="dialog">
			<div class="form-card">
				<div class="form-header">
					<h3>New Template</h3>
					<button class="form-close" onclick={() => (showTemplateForm = false)} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<form onsubmit={(e) => { e.preventDefault(); submitTemplate(); }}>
					<label class="form-field">
						<span>Name</span>
						<input type="text" bind:value={templateForm.name} placeholder="e.g. Bench Press" required />
					</label>
					<label class="form-field">
						<span>Category</span>
						<select bind:value={templateForm.category}>
							{#each categoryOptions as c}
								<option value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
							{/each}
						</select>
					</label>
					<div class="form-row">
						<label class="form-field">
							<span>Default Sets</span>
							<input type="number" bind:value={templateForm.default_sets} min="0" step="1" />
						</label>
						<label class="form-field">
							<span>Default Reps</span>
							<input type="number" bind:value={templateForm.default_reps} min="0" step="1" />
						</label>
					</div>
					<button type="submit" class="form-submit" disabled={templateSubmitting}>
						{templateSubmitting ? 'Saving...' : 'Save Template'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- FAB "+" -->
	<button class="fab" onclick={() => (showLogForm = true)} aria-label="Log exercise">
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

	/* Stats Row */
	.stats-row {
		display: flex;
		gap: 8px;
		margin-bottom: 1.25rem;
	}

	.stat-card {
		flex: 1;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.stat-value {
		font-size: 1.4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.stat-unit {
		font-size: 0.7rem;
		font-weight: 400;
		color: var(--text-secondary);
	}

	.stat-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.stat-skeleton {
		flex: 1;
		height: 64px;
		border-radius: 12px;
	}

	/* Section Header */
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

	/* Exercise List */
	.exercise-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.exercise-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
	}

	.exercise-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1;
		min-width: 0;
	}

	.exercise-name {
		font-size: 0.95rem;
		font-weight: 600;
	}

	.exercise-details {
		display: flex;
		gap: 10px;
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.exercise-notes {
		font-size: 0.72rem;
		color: var(--text-secondary);
		font-style: italic;
		opacity: 0.8;
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
		margin-left: 12px;
	}

	.delete-btn:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	.delete-btn svg {
		width: 14px;
		height: 14px;
	}

	/* History Toggle */
	.toggle-group {
		display: flex;
		gap: 2px;
		background: var(--bg-elevated);
		border-radius: 8px;
		padding: 2px;
	}

	.toggle-btn {
		padding: 4px 10px;
		border: none;
		background: none;
		color: var(--text-secondary);
		font-size: 0.72rem;
		font-weight: 600;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.toggle-active {
		background: var(--accent);
		color: white;
	}

	/* Bar Chart */
	.chart-container {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 16px;
	}

	.bar-chart {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 100px;
	}

	.bar-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}

	.bar {
		width: 100%;
		max-width: 20px;
		background: var(--accent);
		border-radius: 3px 3px 0 0;
		min-height: 4px;
		transition: height 0.3s ease;
	}

	.bar-label {
		font-size: 0.6rem;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}

	/* Templates */
	.section-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		color: inherit;
	}

	.chevron {
		width: 14px;
		height: 14px;
		color: var(--text-secondary);
		transition: transform 0.2s;
	}

	.chevron-open {
		transform: rotate(180deg);
	}

	.add-template-btn {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: none;
		color: var(--text-secondary);
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: color 0.2s, border-color 0.2s;
	}

	.add-template-btn:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.template-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.template-category {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.template-cat-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: capitalize;
		letter-spacing: 0.04em;
	}

	.template-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 10px 14px;
		cursor: pointer;
		transition: border-color 0.2s;
		width: 100%;
		text-align: left;
		color: inherit;
	}

	.template-item:hover {
		border-color: var(--accent);
	}

	.template-name {
		font-size: 0.88rem;
		font-weight: 500;
	}

	.template-defaults {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	/* Empty States */
	.empty-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.5rem;
		text-align: center;
		color: var(--text-secondary);
	}

	.empty-hint {
		font-size: 0.85rem;
		margin-top: 0.5rem;
		opacity: 0.7;
	}

	/* Mode Toggle */
	.mode-toggle {
		display: flex;
		gap: 2px;
		background: var(--bg-elevated);
		border-radius: 10px;
		padding: 3px;
		margin-bottom: 12px;
	}

	.mode-btn {
		flex: 1;
		padding: 8px;
		border: none;
		background: none;
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 600;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.mode-active {
		background: var(--accent);
		color: white;
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
		max-height: 80vh;
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

	.skeleton-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		margin-bottom: 8px;
	}
</style>
