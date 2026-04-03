<script lang="ts">
	import { query } from '$lib/db';

	let rows = $state<any[]>([]);
	let daily = $state<any[]>([]);
	let error = $state('');
	let totalCost = $derived(rows.reduce((s, r) => s + Number(r.cost), 0));
	let totalReqs = $derived(rows.reduce((s, r) => s + Number(r.requests), 0));

	async function load() {
		try {
			rows = await query(
				`SELECT
				   COALESCE(task_id, 'interactive') as task,
				   COUNT(*) as requests,
				   ROUND(SUM(cost_usd)::NUMERIC, 4) as cost
				 FROM lifeos.api_usage
				 WHERE created_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '7' DAY
				 GROUP BY task_id
				 ORDER BY cost DESC`
			);
			daily = await query(
				`SELECT
				   created_at::DATE::VARCHAR as date,
				   ROUND(SUM(cost_usd)::NUMERIC, 4) as cost
				 FROM lifeos.api_usage
				 WHERE created_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '7' DAY
				 GROUP BY created_at::DATE ORDER BY date`
			);
		} catch (e: any) {
			error = e.message;
		}
	}

	function sparkBars(data: any[]): string {
		if (data.length === 0) return '';
		const vals = data.map(d => Number(d.cost));
		const max = Math.max(...vals) || 1;
		const w = 200, h = 40, bw = w / vals.length - 2;
		const bars = vals.map((v, i) =>
			`<rect x="${i * (bw + 2)}" y="${h - (v / max) * h}" width="${bw}" height="${(v / max) * h}" fill="var(--accent)" rx="2"/>`
		).join('');
		return `<svg viewBox="0 0 ${w} ${h}" class="spark">${bars}</svg>`;
	}

	$effect(() => { load(); });
</script>

<h1>API Usage (7 days)</h1>

{#if error}
	<p class="error">{error}</p>
{:else if rows.length === 0}
	<p class="muted">No API usage recorded.</p>
{:else}
	{#if daily.length > 1}
		<div class="spark-wrap">{@html sparkBars(daily)}</div>
	{/if}
	<table>
		<thead>
			<tr><th>Task</th><th>Reqs</th><th>Cost</th></tr>
		</thead>
		<tbody>
			{#each rows as r}
				<tr><td>{r.task}</td><td>{r.requests}</td><td>${Number(r.cost).toFixed(4)}</td></tr>
			{/each}
		</tbody>
		<tfoot>
			<tr><td>Total</td><td>{totalReqs}</td><td>${totalCost.toFixed(4)}</td></tr>
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
