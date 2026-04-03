<script lang="ts">
	import { query } from '$lib/db';

	let meals = $state<any[]>([]);
	let error = $state('');
	let saving = $state(false);

	let mealType = $state('lunch');
	let description = $state('');
	let calories = $state<number | ''>('');
	let protein = $state<number | ''>('');

	let totalCal = $derived(meals.reduce((s, m) => s + (m.calories ?? 0), 0));
	let totalPro = $derived(meals.reduce((s, m) => s + (m.protein_g ?? 0), 0));

	async function load() {
		try {
			meals = await query(
				`SELECT cl.meal_type, cl.description, cl.calories, cl.protein_g
				 FROM lifeos.calorie_log cl
				 WHERE cl.log_date = (NOW() AT TIME ZONE 'America/Edmonton')::DATE
				 ORDER BY cl.created_at`
			);
		} catch (e: any) {
			error = e.message;
		}
	}

	async function submit() {
		if (!description || !calories) return;
		saving = true;
		try {
			await query(
				`INSERT INTO lifeos.calorie_log (id, log_date, meal_type, description, calories, protein_g, source, created_at)
				 VALUES (?, (NOW() AT TIME ZONE 'America/Edmonton')::DATE, ?, ?, ?, ?, 'manual', NOW())`,
				crypto.randomUUID(), mealType, description, Number(calories), Number(protein) || 0
			);
			description = '';
			calories = '';
			protein = '';
			await load();
		} catch (e: any) {
			error = e.message;
		} finally {
			saving = false;
		}
	}

	$effect(() => { load(); });
</script>

<h1>Meals</h1>

{#if error}
	<p class="error">{error}</p>
{/if}

<section>
	<h2>Today</h2>
	{#if meals.length === 0}
		<p class="muted">No meals logged today.</p>
	{:else}
		<ul class="meal-list">
			{#each meals as m}
				<li>
					<div class="meal-top">
						<span class="meal-type">{m.meal_type}</span>
						<span class="meal-cal">{m.calories} cal</span>
					</div>
					<div class="meal-desc">{m.description}</div>
					{#if m.protein_g}<div class="meal-pro">{m.protein_g}g protein</div>{/if}
				</li>
			{/each}
		</ul>
		<div class="totals">
			<span>Total: {Math.round(totalCal)} cal</span>
			<span>{Math.round(totalPro)}g protein</span>
		</div>
	{/if}
</section>

<section>
	<h2>Log a meal</h2>
	<form onsubmit={(e) => { e.preventDefault(); submit(); }}>
		<select bind:value={mealType}>
			<option value="breakfast">Breakfast</option>
			<option value="lunch">Lunch</option>
			<option value="dinner">Dinner</option>
			<option value="snack">Snack</option>
		</select>
		<input type="text" bind:value={description} placeholder="Description" required />
		<input type="number" bind:value={calories} placeholder="Calories" required />
		<input type="number" bind:value={protein} placeholder="Protein (g)" />
		<button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Log meal'}</button>
	</form>
</section>

<style>
	h1 { font-size: 1.4rem; margin-bottom: 1rem; }
	h2 { font-size: 1rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
	section { margin-bottom: 1.5rem; }
	.error { color: var(--danger); margin-bottom: 0.5rem; }
	.muted { color: var(--text-secondary); }
	.meal-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.meal-list li { background: var(--bg-card); border-radius: 8px; padding: 0.75rem 1rem; }
	.meal-top { display: flex; justify-content: space-between; }
	.meal-type { text-transform: capitalize; font-weight: 500; }
	.meal-cal { font-weight: 600; font-variant-numeric: tabular-nums; }
	.meal-desc { font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem; }
	.meal-pro { font-size: 0.8rem; color: var(--text-secondary); }
	.totals {
		display: flex; justify-content: space-between; margin-top: 0.5rem;
		padding: 0.5rem 1rem; background: var(--bg-elevated); border-radius: 8px;
		font-weight: 600; font-size: 0.9rem;
	}
	form { display: flex; flex-direction: column; gap: 0.5rem; }
	input, select {
		background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
		padding: 0.6rem 0.75rem; color: var(--text-primary); font-size: 0.9rem;
	}
	button {
		background: var(--accent); color: #fff; border: none; border-radius: 8px;
		padding: 0.6rem; font-weight: 600; font-size: 0.9rem;
	}
	button:disabled { opacity: 0.5; }
</style>
