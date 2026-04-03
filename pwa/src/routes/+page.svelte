<script lang="ts">
	import { query, queryOrDefault } from '$lib/db';

	let steps = $state<number | null>(null);
	let calories = $state<number | null>(null);
	let weight = $state<number | null>(null);
	let spend = $state<number | null>(null);
	let error = $state('');

	async function load() {
		try {
			const [s, c, w, sp] = await Promise.all([
				queryOrDefault<any>(
					`SELECT MAX(value) as v FROM lifeos.health_metrics WHERE metric_type='steps' AND recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE`,
					{ v: 0 }
				),
				queryOrDefault<any>(
					`SELECT COALESCE(SUM(calories), 0) as total FROM lifeos.calorie_log WHERE log_date = (NOW() AT TIME ZONE 'America/Edmonton')::DATE`,
					{ total: 0 }
				),
				queryOrDefault<any>(
					`SELECT value as v FROM lifeos.health_metrics WHERE metric_type='weight' ORDER BY recorded_at DESC LIMIT 1`,
					{ v: null }
				),
				queryOrDefault<any>(
					`SELECT COALESCE(SUM(amount), 0) as total FROM lifeos.transactions WHERE transaction_date >= date_trunc('month', (NOW() AT TIME ZONE 'America/Edmonton')::DATE)`,
					{ total: 0 }
				),
			]);
			steps = s.v ?? 0;
			calories = c.total ?? 0;
			weight = w.v;
			spend = sp.total ?? 0;
		} catch (e: any) {
			error = e.message;
		}
	}

	$effect(() => { load(); });
</script>

<h1>Dashboard</h1>

{#if error}
	<p class="error">{error}</p>
{:else}
	<div class="cards">
		<div class="card">
			<span class="label">Steps today</span>
			<span class="value">{steps !== null ? steps.toLocaleString() : '...'}</span>
		</div>
		<div class="card">
			<span class="label">Calories today</span>
			<span class="value">{calories !== null ? Math.round(calories) : '...'}</span>
		</div>
		<div class="card">
			<span class="label">Latest weight</span>
			<span class="value">{weight !== null ? `${weight} lbs` : '...'}</span>
		</div>
		<div class="card">
			<span class="label">Spend this month</span>
			<span class="value">{spend !== null ? `$${Number(spend).toFixed(2)}` : '...'}</span>
		</div>
	</div>
{/if}

<style>
	h1 { font-size: 1.4rem; margin-bottom: 1rem; }
	.error { color: var(--danger); }
	.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	.card {
		background: var(--bg-card); border-radius: 10px; padding: 1rem;
		display: flex; flex-direction: column; gap: 0.25rem;
	}
	.label { font-size: 0.75rem; color: var(--text-secondary); }
	.value { font-size: 1.3rem; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
