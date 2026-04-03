<script lang="ts">
	import { query } from '$lib/db';

	let rows = $state<any[]>([]);
	let error = $state('');
	let totalCost = $derived(rows.reduce((s, r) => s + Number(r.cost), 0));

	async function load() {
		try {
			rows = await query(
				`SELECT
				   COALESCE(model, 'unknown') as model,
				   COUNT(*) as requests,
				   ROUND(SUM(cost_usd)::NUMERIC, 4) as cost
				 FROM lifeos.api_usage
				 WHERE created_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '7' DAY
				 GROUP BY model
				 ORDER BY cost DESC`
			);
		} catch (e: any) {
			error = e.message;
		}
	}

	$effect(() => { load(); });
</script>

<h1>API Usage (7 days)</h1>

{#if error}
	<p class="error">{error}</p>
{:else if rows.length === 0}
	<p class="muted">No API usage recorded.</p>
{:else}
	<table>
		<thead>
			<tr><th>Model</th><th>Requests</th><th>Cost</th></tr>
		</thead>
		<tbody>
			{#each rows as r}
				<tr><td>{r.model}</td><td>{r.requests}</td><td>${Number(r.cost).toFixed(4)}</td></tr>
			{/each}
		</tbody>
		<tfoot>
			<tr><td colspan="2">Total</td><td>${totalCost.toFixed(4)}</td></tr>
		</tfoot>
	</table>
{/if}

<style>
	h1 { font-size: 1.4rem; margin-bottom: 1rem; }
	.error { color: var(--danger); }
	.muted { color: var(--text-secondary); }
	table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
	th, td { text-align: left; padding: 0.5rem 0.75rem; }
	th { color: var(--text-secondary); font-weight: 500; font-size: 0.8rem; border-bottom: 1px solid var(--border); }
	td { border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
	tfoot td { font-weight: 700; border-top: 2px solid var(--border); border-bottom: none; }
</style>
