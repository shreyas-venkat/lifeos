<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { MealPlanRecord, CalorieEntry, RecipeSummary, RecipeDetail } from '$lib/api';

	let plan = $state<MealPlanRecord[]>([]);
	let todayCalories = $state<CalorieEntry[]>([]);
	let recipes = $state<RecipeSummary[]>([]);
	let search = $state('');
	let loading = $state(true);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	// Calorie log form
	let showCalorieForm = $state(false);
	let calForm = $state({
		meal_type: 'lunch' as string,
		description: '',
		calories: 0,
		protein_g: 0,
		carbs_g: 0,
		fat_g: 0,
	});
	let calSubmitting = $state(false);

	// Recipe detail expansion (recipe browser)
	let expandedRecipeId = $state<string | null>(null);
	let recipeDetails = $state<Record<string, RecipeDetail | null>>({});
	let recipeLoading = $state<Record<string, boolean>>({});

	// Meal card expansion (meal plan section)
	let expandedMealId = $state<string | null>(null);
	let mealRecipeDetails = $state<Record<string, RecipeDetail | null>>({});
	let mealRecipeLoading = $state<Record<string, boolean>>({});

	const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const statusOrder = ['planned', 'cooked', 'skipped', 'ate_out'];

	const statusColors: Record<string, string> = {
		planned: '#8888a0',
		cooked: '#22c55e',
		skipped: '#f59e0b',
		ate_out: '#6366f1',
	};

	const statusLabels: Record<string, string> = {
		planned: 'Planned',
		cooked: 'Cooked',
		skipped: 'Skipped',
		ate_out: 'Ate Out',
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

	// Group meal plan by day_of_week, compute date for each day
	const planByDay = $derived(() => {
		const grouped: Record<number, MealPlanRecord[]> = {};
		for (const meal of plan) {
			if (!grouped[meal.day_of_week]) grouped[meal.day_of_week] = [];
			grouped[meal.day_of_week].push(meal);
		}
		return grouped;
	});

	// Compute the date for each day_of_week based on week_start
	function getDayDate(dayOfWeek: number): string {
		if (plan.length === 0) return '';
		const ws = new Date(plan[0].week_start);
		const d = new Date(ws);
		d.setDate(ws.getDate() + (dayOfWeek - 1));
		return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
	}

	function handleSearch() {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(async () => {
			recipes = await api.meals.recipes(search);
		}, 300);
	}

	async function setStatus(meal: MealPlanRecord, newStatus: string) {
		try {
			await api.meals.updateStatus(meal.id, newStatus);
			// Auto-log calories when marking as cooked
			if (newStatus === 'cooked' && meal.calories_per_serving) {
				await api.calories.log({
					meal_type: 'dinner',
					description: meal.recipe_name ?? 'Dinner',
					calories: meal.calories_per_serving,
				});
				await api.calories.log({
					meal_type: 'lunch',
					description: `${meal.recipe_name ?? 'Leftovers'} (leftovers)`,
					calories: meal.calories_per_serving,
				});
				todayCalories = await api.calories.today();
			}
			plan = await api.meals.plan();
		} catch {
			// Keep current state
		}
	}

	async function submitCalorieLog() {
		if (calSubmitting) return;
		calSubmitting = true;
		try {
			await api.calories.log({
				meal_type: calForm.meal_type,
				description: calForm.description,
				calories: calForm.calories,
				protein_g: calForm.protein_g || undefined,
				carbs_g: calForm.carbs_g || undefined,
				fat_g: calForm.fat_g || undefined,
			});
			todayCalories = await api.calories.today();
			showCalorieForm = false;
			calForm = { meal_type: 'lunch', description: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
		} catch {
			// Submission failed
		} finally {
			calSubmitting = false;
		}
	}

	async function toggleRecipeDetail(recipeId: string) {
		if (expandedRecipeId === recipeId) {
			expandedRecipeId = null;
			return;
		}
		expandedRecipeId = recipeId;
		if (!recipeDetails[recipeId] && !recipeLoading[recipeId]) {
			recipeLoading[recipeId] = true;
			recipeLoading = { ...recipeLoading };
			const detail = await api.meals.recipeDetail(recipeId);
			recipeDetails[recipeId] = detail;
			recipeDetails = { ...recipeDetails };
			recipeLoading[recipeId] = false;
			recipeLoading = { ...recipeLoading };
		}
	}

	async function toggleMealDetail(meal: MealPlanRecord) {
		if (!meal.recipe_id) return;
		const rid = meal.recipe_id;
		if (expandedMealId === meal.id) {
			expandedMealId = null;
			return;
		}
		expandedMealId = meal.id;
		if (!mealRecipeDetails[rid] && !mealRecipeLoading[rid]) {
			mealRecipeLoading[rid] = true;
			mealRecipeLoading = { ...mealRecipeLoading };
			const detail = await api.meals.recipeDetail(rid);
			mealRecipeDetails[rid] = detail;
			mealRecipeDetails = { ...mealRecipeDetails };
			mealRecipeLoading[rid] = false;
			mealRecipeLoading = { ...mealRecipeLoading };
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

		<!-- Weekly Meal Plan - Vertical day-by-day -->
		<section class="section fade-in">
			<h2>Weekly Plan</h2>
			{#if plan.length > 0}
				<div class="day-list">
					{#each Array(7) as _, dayIdx}
						{@const dayMeals = planByDay()[dayIdx + 1] ?? []}
						{#if dayMeals.length > 0}
							<div class="day-card">
								<div class="day-card-header">
									<span class="day-name">{dayNames[dayIdx]}</span>
									<span class="day-date">{getDayDate(dayIdx + 1)}</span>
								</div>
								{#each dayMeals as meal}
									<button
										class="meal-row"
										class:meal-row-expandable={!!meal.recipe_id}
										class:meal-row-expanded={expandedMealId === meal.id}
										onclick={() => toggleMealDetail(meal)}
									>
										<div class="meal-info">
											<span class="meal-name">{meal.recipe_name ?? meal.meal_type}</span>
											<div class="meal-meta">
												{#if meal.calories_per_serving}
													<span>{meal.calories_per_serving} kcal</span>
												{/if}
												{#if meal.servings}
													<span>{meal.servings} servings</span>
												{/if}
												{#if meal.prep_time_min}
													<span>{meal.prep_time_min} min prep</span>
												{/if}
												{#if meal.cook_time_min}
													<span>{meal.cook_time_min} min cook</span>
												{/if}
											</div>
											{#if meal.notes}
												<span class="meal-notes">{meal.notes}</span>
											{/if}
										</div>
										<select
											class="status-select"
											style="color: {statusColors[meal.status] ?? '#8888a0'}; border-color: {statusColors[meal.status] ?? '#8888a0'}40"
											value={meal.status}
											onchange={(e) => { e.stopPropagation(); setStatus(meal, (e.target as HTMLSelectElement).value); }}
										>
											{#each statusOrder as opt}
												<option value={opt}>{statusLabels[opt] ?? opt}</option>
											{/each}
										</select>
									</button>
									{#if expandedMealId === meal.id && meal.recipe_id}
										<div class="recipe-detail meal-detail fade-in">
											{#if mealRecipeLoading[meal.recipe_id]}
												<div class="skeleton" style="height: 80px;"></div>
											{:else if mealRecipeDetails[meal.recipe_id]}
												{@const d = mealRecipeDetails[meal.recipe_id]}
												{#if d}
													{#if d.ingredients}
														{@const parsed = typeof d.ingredients === 'string' ? (() => { try { return JSON.parse(d.ingredients); } catch { return [d.ingredients]; } })() : Array.isArray(d.ingredients) ? d.ingredients : []}
														{#if parsed.length > 0}
															<div class="detail-section">
																<h4>Ingredients</h4>
																<ul class="ingredient-list">
																	{#each parsed as ing}
																		<li>{typeof ing === 'object' ? `${ing.name || ing.item || ''}${ing.qty ? ' — ' + ing.qty : ''}${ing.quantity ? ' — ' + ing.quantity + (ing.unit ? ' ' + ing.unit : '') : ''}` : ing}</li>
																	{/each}
																</ul>
															</div>
														{/if}
													{/if}
													{#if d.instructions}
														<div class="detail-section">
															<h4>Instructions</h4>
															<p class="instructions-text">{d.instructions}</p>
														</div>
													{/if}
													<div class="detail-macros">
														{#if d.calories_per_serving !== null}
															<span>{d.calories_per_serving} kcal</span>
														{/if}
														{#if d.servings !== null}
															<span>{d.servings} servings</span>
														{/if}
														{#if d.protein_g !== null}
															<span>P: {d.protein_g}g</span>
														{/if}
														{#if d.carbs_g !== null}
															<span>C: {d.carbs_g}g</span>
														{/if}
														{#if d.fat_g !== null}
															<span>F: {d.fat_g}g</span>
														{/if}
														{#if d.prep_time_min !== null}
															<span>{d.prep_time_min} min prep</span>
														{/if}
														{#if d.cook_time_min !== null}
															<span>{d.cook_time_min} min cook</span>
														{/if}
													</div>
												{/if}
											{:else}
												<p class="detail-error">Recipe details not available</p>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						{/if}
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
					<button
						class="recipe-card"
						class:recipe-expanded={expandedRecipeId === recipe.id}
						onclick={() => toggleRecipeDetail(recipe.id)}
					>
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
							{#if recipe.servings !== null}
								<span>{recipe.servings} servings</span>
							{/if}
							{#if recipe.prep_time_min !== null}
								<span>{recipe.prep_time_min} min prep</span>
							{/if}
							{#if recipe.cook_time_min !== null}
								<span>{recipe.cook_time_min} min cook</span>
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

						<!-- Expanded detail -->
						{#if expandedRecipeId === recipe.id}
							<div class="recipe-detail">
								{#if recipeLoading[recipe.id]}
									<div class="skeleton" style="height: 80px;"></div>
								{:else if recipeDetails[recipe.id]}
									{@const d = recipeDetails[recipe.id]}
									{#if d}
										{#if d.ingredients}
											{@const parsed = typeof d.ingredients === 'string' ? (() => { try { return JSON.parse(d.ingredients); } catch { return [d.ingredients]; } })() : Array.isArray(d.ingredients) ? d.ingredients : []}
											{#if parsed.length > 0}
												<div class="detail-section">
													<h4>Ingredients</h4>
													<ul class="ingredient-list">
														{#each parsed as ing}
															<li>{typeof ing === 'object' ? `${ing.name || ing.item || ''}${ing.qty ? ' — ' + ing.qty : ''}${ing.quantity ? ' — ' + ing.quantity + (ing.unit ? ' ' + ing.unit : '') : ''}` : ing}</li>
														{/each}
													</ul>
												</div>
											{/if}
										{/if}
										{#if d.instructions}
											<div class="detail-section">
												<h4>Instructions</h4>
												<p class="instructions-text">{d.instructions}</p>
											</div>
										{/if}
										<div class="detail-macros">
											{#if d.calories_per_serving !== null}
												<span>{d.calories_per_serving} kcal</span>
											{/if}
											{#if d.servings !== null}
												<span>{d.servings} servings</span>
											{/if}
											{#if d.protein_g !== null}
												<span>P: {d.protein_g}g</span>
											{/if}
											{#if d.carbs_g !== null}
												<span>C: {d.carbs_g}g</span>
											{/if}
											{#if d.fat_g !== null}
												<span>F: {d.fat_g}g</span>
											{/if}
											{#if d.prep_time_min !== null}
												<span>{d.prep_time_min} min prep</span>
											{/if}
											{#if d.cook_time_min !== null}
												<span>{d.cook_time_min} min cook</span>
											{/if}
										</div>
									{/if}
								{:else}
									<p class="detail-error">Details not available</p>
								{/if}
							</div>
						{/if}
					</button>
				{/each}
				{#if recipes.length === 0}
					<p class="empty-text">No recipes found</p>
				{/if}
			</div>
		</section>

		<!-- Calorie Log Form -->
		{#if showCalorieForm}
			<div class="form-overlay fade-in" role="dialog">
				<div class="form-card">
					<div class="form-header">
						<h3>Log Meal</h3>
						<button class="form-close" onclick={() => (showCalorieForm = false)} aria-label="Close">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
					<form onsubmit={(e) => { e.preventDefault(); submitCalorieLog(); }}>
						<label class="form-field">
							<span>Meal Type</span>
							<select bind:value={calForm.meal_type}>
								<option value="breakfast">Breakfast</option>
								<option value="lunch">Lunch</option>
								<option value="dinner">Dinner</option>
								<option value="snack">Snack</option>
							</select>
						</label>
						<label class="form-field">
							<span>Description</span>
							<input type="text" bind:value={calForm.description} placeholder="What did you eat?" />
						</label>
						<label class="form-field">
							<span>Calories</span>
							<input type="number" bind:value={calForm.calories} min="0" />
						</label>
						<div class="form-row">
							<label class="form-field">
								<span>Protein (g)</span>
								<input type="number" bind:value={calForm.protein_g} min="0" />
							</label>
							<label class="form-field">
								<span>Carbs (g)</span>
								<input type="number" bind:value={calForm.carbs_g} min="0" />
							</label>
							<label class="form-field">
								<span>Fat (g)</span>
								<input type="number" bind:value={calForm.fat_g} min="0" />
							</label>
						</div>
						<button type="submit" class="form-submit" disabled={calSubmitting}>
							{calSubmitting ? 'Logging...' : 'Log Meal'}
						</button>
					</form>
				</div>
			</div>
		{/if}

		<!-- FAB to log calorie entry -->
		<button class="fab" onclick={() => (showCalorieForm = true)} aria-label="Log meal">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<line x1="12" y1="5" x2="12" y2="19" />
				<line x1="5" y1="12" x2="19" y2="12" />
			</svg>
		</button>
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

	/* Vertical day-by-day list */
	.day-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.day-card {
		background: var(--bg-card);
		border-radius: 12px;
		border: 1px solid var(--border);
		overflow: hidden;
	}

	.day-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 14px;
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border);
	}

	.day-name {
		font-weight: 600;
		font-size: 0.9rem;
	}

	.day-date {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.meal-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		width: 100%;
		background: none;
		border-left: none;
		border-right: none;
		border-top: none;
		color: var(--text-primary);
		text-align: left;
		font-family: inherit;
		font-size: inherit;
		cursor: default;
	}

	.meal-row-expandable {
		cursor: pointer;
	}

	.meal-row-expandable:hover {
		background: var(--bg-elevated);
	}

	.meal-row-expanded {
		background: var(--bg-elevated);
	}

	.meal-row:last-of-type {
		border-bottom: none;
	}

	.meal-detail {
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
	}

	.meal-detail:last-child {
		border-bottom: none;
	}

	.meal-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.meal-name {
		font-size: 0.9rem;
		font-weight: 500;
	}

	.meal-meta {
		display: flex;
		gap: 10px;
		font-size: 0.72rem;
		color: var(--text-secondary);
	}

	.meal-notes {
		font-size: 0.72rem;
		color: var(--text-secondary);
		font-style: italic;
	}

	.status-select {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 4px 8px;
		font-size: 0.72rem;
		cursor: pointer;
		text-transform: capitalize;
		flex-shrink: 0;
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
		cursor: pointer;
		transition: border-color 0.2s;
		text-align: left;
		width: 100%;
		color: var(--text-primary);
		display: block;
	}

	.recipe-card:hover {
		border-color: var(--accent);
	}

	.recipe-expanded {
		border-color: var(--accent);
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

	/* Recipe detail expansion */
	.recipe-detail {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}

	.detail-section {
		margin-bottom: 10px;
	}

	.detail-section h4 {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-bottom: 4px;
	}

	.ingredient-list {
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-primary);
	}

	.ingredient-list li {
		padding: 2px 0;
	}

	.ingredient-list li::before {
		content: '\2022 ';
		color: var(--text-secondary);
	}

	.instructions-text {
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-primary);
		white-space: pre-wrap;
	}

	.detail-macros {
		display: flex;
		gap: 12px;
		font-size: 0.72rem;
		color: var(--text-secondary);
		flex-wrap: wrap;
	}

	.detail-error {
		font-size: 0.82rem;
		color: var(--text-secondary);
		font-style: italic;
		padding: 8px 0;
	}

	/* Calorie log form overlay */
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
		padding: 20px;
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

	.empty-text {
		text-align: center;
		padding: 1.5rem;
		color: var(--text-secondary);
		font-size: 0.9rem;
	}
</style>
