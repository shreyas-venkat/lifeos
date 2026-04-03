<script lang="ts">
	import { query } from '$lib/db';

	let metrics = $state<any[]>([]);
	let error = $state('');

	async function load() {
		try {
			metrics = await query(
				`SELECT metric_type, MAX(value) as value, MAX(unit) as unit
				 FROM lifeos.health_metrics
				 WHERE recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE
				 GROUP BY metric_type
				 ORDER BY metric_type`
			);
		} catch (e: any) {
			error = e.message;
		}
	}

	$effect(() => { load(); });
</script>

<h1>Health</h1>

{#if error}
	<p class="error">{error}</p>
{:else if metrics.length === 0}
	<p class="muted">No health data recorded today.</p>
{:else}
	<ul class="metric-list">
		{#each metrics as m}
			<li>
				<span class="metric-type">{m.metric_type}</span>
				<span class="metric-val">{Number(m.value).toLocaleString()} {m.unit ?? ''}</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 { font-size: 1.4rem; margin-bottom: 1rem; }
	.error { color: var(--danger); }
	.muted { color: var(--text-secondary); }
	.metric-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.metric-list li {
		display: flex; justify-content: space-between; align-items: center;
		background: var(--bg-card); border-radius: 8px; padding: 0.75rem 1rem;
	}
	.metric-type { text-transform: capitalize; color: var(--text-secondary); font-size: 0.85rem; }
	.metric-val { font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
