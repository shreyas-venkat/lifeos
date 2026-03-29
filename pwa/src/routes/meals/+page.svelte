<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { MealPlanRecord, CalorieEntry, RecipeSummary } from '$lib/api';

	let plan = $state<MealPlanRecord[]>([]);
	let todayCalories = $state<CalorieEntry[]>([]);
	let recipes = $state<RecipeSummary[]>([]);
	let search = $state('');
	let loading = $state(true);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	const statusColors: Record<string, string> = {
		planned: '#8888a0',
		cooked: '#22c55e',
		skipped: '#f59e0b',
		ate_out: '#6366f1',
	};

	// Compute daily calorie totals
	const totalCalories = $derived(
		todayCalories.reduce((sum, e) => sum + (e.calories ?? 0), 0)
	);
	const totalProtein = $derived(
		todayCalories.reduce((sum, e) => sum + (e.protein_g ?? 0), 0)
	);
	const totalCarbs = $derived(
		todayCalories.reduce((sum, e) => sum + (e.carbs_g ?? 0), 0)
	);
	const totalFat = $derived(
		todayCalories.reduce((sum, e) => sum + (e.fat_g ?? 0), 0)
	);
	const totalMacros = $derived(totalProtein + totalCarbs + totalFat);

	// Group meal plan by day_of_week
	const planByDay = $derived(() => {
		const grouped: Record<number, MealPlanRecord[]> = {};
		for (const meal of plan) {
			if (!grouped[meal.day_of_week]) grouped[meal.day_of_week] = [];
			grouped[meal.day_of_week].push(meal);
		}
		return grouped;
	});

	function handleSearch() {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(async () => {
			recipes = await api.meals.recipes(search);
		}, 300);
	}

	async function toggleStatus(meal: MealPlanRecord) {
		const nextStatus = meal.status === 'cooked' ? 'planned' : 'cooked';
		try {
			await api.meals.updateStatus(meal.id, nextStatus);
			meal.status = nextStatus;
			plan = [...plan];
		} catch {
			// Keep current state
		}
	}

	function renderStars(rating: number | null): string {
		if (rating === null) return '';
		const full = Math.round(rating);
		return '\u2605'.repeat(full) + '\u2606'.repeat(5 - full);
	}

	onMount(async () => {
		const [p, c, r] = await Promise.allSettled([
			api.meals.plan(),
			api.calories.today(),
			api.meals.recipes(),
		]);
		if (p.status === 'fulfilled') plan = p.value;
		if (c.status === 'fulfilled') todayCalories = c.value;
		if (r.status === 'fulfilled') recipes = r.value;
		loading = false;
	});
</script>

<svelte:head>
	<title>Meals - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Meals & Calories</h1>

	{#if loading}
		<div class="skeleton" style="height: 120px; margin-bottom: 1rem;"></div>
		<div class="skeleton" style="height: 200px; margin-bottom: 1rem;"></div>
	{:else}
		<!-- Calorie Summary -->
		<section class="calorie-card fade-in">
			{#if todayCalories.length > 0}
				<div class="calorie-header">
					<span class="calorie-label">Today's Calories</span>
					<span class="calorie-total">{Math.round(totalCalories)} kcal</span>
				</div>
				{#if totalMacros > 0}
					<div class="macro-bar">
						<div
							class="macro-segment protein"
							style="width: {(totalProtein / totalMacros) * 100}%"
							title="Protein: {Math.round(totalProtein)}g"
						></div>
						<div
							class="macro-segment carbs"
							style="width: {(totalCarbs / totalMacros) * 100}%"
							title="Carbs: {Math.round(totalCarbs)}g"
						></div>
						<div
							class="macro-segment fat"
							style="width: {(totalFat / totalMacros) * 100}%"
							title="Fat: {Math.round(totalFat)}g"
						></div>
					</div>
					<div class="macro-labels">
						<span class="macro-label protein-label">P: {Math.round(totalProtein)}g</span>
						<span class="macro-label carbs-label">C: {Math.round(totalCarbs)}g</span>
						<span class="macro-label fat-label">F: {Math.round(totalFat)}g</span>
					</div>
				{/if}
			{:else}
				<p class="empty-text">No meals logged today</p>
			{/if}
		</section>

		<!-- Weekly Meal Plan -->
		<section class="section fade-in">
			<h2>Weekly Plan</h2>
			{#if plan.length > 0}
				<div class="week-grid">
					{#each Array(7) as _, dayIdx}
						{@const dayMeals = planByDay()[dayIdx + 1] ?? []}
						<div class="day-column">
							<span class="day-label">{dayNames[dayIdx]}</span>
							{#each dayMeals as meal}
								<button
									class="meal-chip"
									style="border-left: 3px solid {statusColors[meal.status] ?? '#8888a0'}"
									onclick={() => toggleStatus(meal)}
								>
									<span class="meal-name">{meal.recipe_name ?? meal.meal_type}</span>
									{#if meal.calories_per_serving}
										<span class="meal-cal">{meal.calories_per_serving} kcal</span>
									{/if}
								</button>
							{/each}
							{#if dayMeals.length === 0}
								<span class="no-meal">--</span>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="empty-text">No meal plan for this week</p>
			{/if}
		</section>

		<!-- Recipe Browser -->
		<section class="section fade-in">
			<h2>Recipes</h2>
			<input
				type="text"
				placeholder="Search recipes..."
				bind:value={search}
				oninput={handleSearch}
				class="search-input"
			/>
			<div class="recipe-list">
				{#each recipes as recipe}
					<div class="recipe-card">
						<div class="recipe-header">
							<span class="recipe-name">{recipe.name}</span>
							{#if recipe.rating !== null}
								<span class="recipe-stars">{renderStars(recipe.rating)}</span>
							{/if}
						</div>
						<div class="recipe-meta">
							{#if recipe.calories_per_serving !== null}
								<span>{recipe.calories_per_serving} kcal</span>
							{/if}
							{#if recipe.prep_time_min !== null}
								<span>{recipe.prep_time_min} min</span>
							{/if}
							{#if recipe.times_cooked > 0}
								<span>Cooked {recipe.times_cooked}x</span>
							{/if}
						</div>
						{#if recipe.tags && recipe.tags.length > 0}
							<div class="recipe-tags">
								{#each recipe.tags as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
				{#if recipes.length === 0}
					<p class="empty-text">No recipes found</p>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 1.25rem;
	}

	h2 {
		font-size: 0.8rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.75rem;
		font-weight: 500;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.calorie-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 1rem;
		margin-bottom: 1.5rem;
		border: 1px solid var(--border);
	}

	.calorie-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.calorie-label {
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	.calorie-total {
		font-size: 1.25rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.macro-bar {
		display: flex;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		background: var(--bg-elevated);
		margin-bottom: 0.5rem;
	}

	.macro-segment {
		height: 100%;
		transition: width 0.3s ease;
	}

	.macro-segment.protein { background: #3b82f6; }
	.macro-segment.carbs { background: #f59e0b; }
	.macro-segment.fat { background: #ef4444; }

	.macro-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.macro-label { color: var(--text-secondary); }
	.protein-label { color: #3b82f6; }
	.carbs-label { color: #f59e0b; }
	.fat-label { color: #ef4444; }

	.week-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px;
	}

	@media (max-width: 500px) {
		.week-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.day-column {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.day-label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		font-weight: 600;
		text-align: center;
		margin-bottom: 2px;
	}

	.meal-chip {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		cursor: pointer;
		text-align: left;
		color: var(--text-primary);
		transition: border-color 0.2s;
	}

	.meal-chip:hover {
		border-color: var(--accent);
	}

	.meal-chip .meal-name {
		font-size: 0.7rem;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meal-chip .meal-cal {
		font-size: 0.6rem;
		color: var(--text-secondary);
	}

	.no-meal {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-align: center;
		padding: 6px;
	}

	.search-input {
		width: 100%;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 10px 14px;
		color: var(--text-primary);
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
		transition: border-color 0.2s;
	}

	.search-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.search-input::placeholder {
		color: var(--text-secondary);
	}

	.recipe-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.recipe-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 12px;
		border: 1px solid var(--border);
	}

	.recipe-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.recipe-name {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.recipe-stars {
		color: var(--warning);
		font-size: 0.85rem;
	}

	.recipe-meta {
		display: flex;
		gap: 12px;
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.recipe-tags {
		display: flex;
		gap: 4px;
		margin-top: 6px;
		flex-wrap: wrap;
	}

	.tag {
		background: var(--bg-elevated);
		color: var(--text-secondary);
		padding: 2px 8px;
		border-radius: 6px;
		font-size: 0.65rem;
		font-weight: 500;
	}

	.empty-text {
		text-align: center;
		padding: 1.5rem;
		color: var(--text-secondary);
		font-size: 0.9rem;
	}
</style>
