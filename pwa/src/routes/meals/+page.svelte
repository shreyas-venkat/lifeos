<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { MealPlanDay, CalorieEntry, Recipe } from '$lib/api';

	let plan = $state<MealPlanDay[]>([]);
	let calories = $state<CalorieEntry | null>(null);
	let recipes = $state<Recipe[]>([]);
	let search = $state('');
	let loading = $state(true);
	let error = $state('');

	const filteredRecipes = $derived(
		search.length > 0
			? recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
			: recipes
	);

	onMount(async () => {
		try {
			const [p, c, r] = await Promise.allSettled([
				api.meals.plan(),
				api.calories.today(),
				api.meals.recipes(),
			]);
			if (p.status === 'fulfilled') plan = p.value;
			if (c.status === 'fulfilled') calories = c.value;
			if (r.status === 'fulfilled') recipes = r.value;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load meals';
		} finally {
			loading = false;
		}
	});

	async function updateMealStatus(id: string, status: string) {
		try {
			await api.meals.updateStatus(id, status);
			for (const day of plan) {
				const meal = day.meals.find((m) => m.id === id);
				if (meal) {
					meal.status = status;
					plan = [...plan];
					break;
				}
			}
		} catch {
			// Silently fail, user sees no change
		}
	}
</script>

<svelte:head>
	<title>Meals - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Meals</h1>

	{#if loading}
		<p class="loading">Loading meal plan...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		{#if calories}
			<div class="calorie-summary">
				<div class="calorie-header">
					<span>Today's Calories</span>
					<span class="calorie-count">{calories.total} / {calories.target} kcal</span>
				</div>
				<div class="progress-bar">
					<div
						class="progress-fill"
						style="width: {Math.min((calories.total / calories.target) * 100, 100)}%"
					></div>
				</div>
				{#if calories.meals.length > 0}
					<div class="calorie-meals">
						{#each calories.meals as meal}
							<div class="calorie-meal">
								<span>{meal.name}</span>
								<span class="cal-value">{meal.calories} kcal</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<section class="meal-plan">
			<h2>Weekly Plan</h2>
			{#each plan as day}
				<div class="day-card">
					<h3>{day.date}</h3>
					{#each day.meals as meal}
						<div class="meal-item" class:done={meal.status === 'done'}>
							<div class="meal-info">
								<span class="meal-type">{meal.type}</span>
								<span class="meal-name">{meal.name}</span>
								<span class="meal-cal">{meal.calories} kcal</span>
							</div>
							<button
								class="meal-toggle"
								onclick={() => updateMealStatus(meal.id, meal.status === 'done' ? 'pending' : 'done')}
							>
								{meal.status === 'done' ? 'Done' : 'Mark'}
							</button>
						</div>
					{/each}
				</div>
			{/each}
			{#if plan.length === 0}
				<p class="no-data">No meal plan for this week</p>
			{/if}
		</section>

		<section class="recipe-browser">
			<h2>Recipes</h2>
			<input
				type="text"
				placeholder="Search recipes..."
				bind:value={search}
				class="search-input"
			/>
			<div class="recipe-list">
				{#each filteredRecipes as recipe}
					<div class="recipe-card">
						<div class="recipe-name">{recipe.name}</div>
						<div class="recipe-desc">{recipe.description}</div>
						<div class="recipe-meta">
							<span>{recipe.calories} kcal</span>
							<span class="recipe-rating">{'*'.repeat(recipe.rating)}</span>
						</div>
					</div>
				{/each}
				{#if filteredRecipes.length === 0}
					<p class="no-data">No recipes found</p>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.page h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}
	h2 {
		font-size: 0.85rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.75rem;
	}
	.calorie-summary {
		background: var(--bg-card);
		border-radius: 0.75rem;
		padding: 1rem;
		margin-bottom: 1.5rem;
	}
	.calorie-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.calorie-count {
		font-weight: 600;
	}
	.progress-bar {
		height: 4px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: var(--accent-light);
		border-radius: 2px;
	}
	.calorie-meals {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.calorie-meal {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		color: var(--text-secondary);
	}
	.cal-value {
		font-variant-numeric: tabular-nums;
	}
	.meal-plan {
		margin-bottom: 1.5rem;
	}
	.day-card {
		background: var(--bg-card);
		border-radius: 0.75rem;
		padding: 0.75rem;
		margin-bottom: 0.5rem;
	}
	.day-card h3 {
		font-size: 0.8rem;
		color: var(--text-secondary);
		margin-bottom: 0.5rem;
	}
	.meal-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}
	.meal-item.done {
		opacity: 0.5;
	}
	.meal-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.meal-type {
		font-size: 0.7rem;
		color: var(--text-secondary);
		text-transform: uppercase;
	}
	.meal-name {
		font-size: 0.9rem;
	}
	.meal-cal {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}
	.meal-toggle {
		background: var(--accent);
		color: var(--text-primary);
		border: none;
		border-radius: 0.5rem;
		padding: 0.35rem 0.75rem;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.search-input {
		width: 100%;
		background: var(--bg-card);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		padding: 0.6rem;
		color: var(--text-primary);
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}
	.search-input::placeholder {
		color: var(--text-secondary);
	}
	.recipe-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.recipe-card {
		background: var(--bg-card);
		border-radius: 0.75rem;
		padding: 0.75rem;
	}
	.recipe-name {
		font-weight: 600;
		margin-bottom: 0.25rem;
	}
	.recipe-desc {
		font-size: 0.8rem;
		color: var(--text-secondary);
		margin-bottom: 0.25rem;
	}
	.recipe-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--text-secondary);
	}
	.recipe-rating {
		color: var(--warning);
	}
	.loading,
	.error,
	.no-data {
		text-align: center;
		padding: 2rem;
		color: var(--text-secondary);
	}
	.error {
		color: var(--danger);
	}
</style>
