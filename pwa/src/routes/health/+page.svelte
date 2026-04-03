<script lang="ts">
	import { query } from '$lib/db';

	const DISPLAY: Record<string, { label: string; unit: string; fmt?: (v: number) => string }> = {
		steps: { label: 'Steps', unit: '' },
		heart_rate: { label: 'Heart Rate', unit: 'bpm' },
		spo2: { label: 'SpO2', unit: '%' },
		oxygen_saturation: { label: 'SpO2', unit: '%' },
		sleep_duration: { label: 'Sleep', unit: '', fmt: (v) => `${(v / 60).toFixed(1)}h` },
		weight: { label: 'Weight', unit: 'kg' },
	};

	let latest = $state<any[]>([]);
	let history = $state<any[]>([]);
	let error = $state('');
	let expanded = $state<string | null>(null);

	async function load() {
		try {
			latest = await query(
				`SELECT metric_type, value, unit, recorded_at
				 FROM (
					 SELECT metric_type, value, unit, recorded_at,
						 ROW_NUMBER() OVER (PARTITION BY metric_type ORDER BY recorded_at DESC) as rn
					 FROM lifeos.health_metrics
					 WHERE metric_type IN ('steps','heart_rate','spo2','oxygen_saturation','sleep_duration','weight')
				 ) WHERE rn = 1 ORDER BY metric_type`
			);
		} catch (e: any) { error = e.message; }
	}

	async function loadHistory(metric: string) {
		if (expanded === metric) { expanded = null; return; }
		expanded = metric;
		try {
			history = await query(
				`SELECT recorded_at::DATE::VARCHAR as date, MAX(value) as value
				 FROM lifeos.health_metrics WHERE metric_type = '${metric}'
				 AND recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '14' DAY
				 GROUP BY recorded_at::DATE ORDER BY date`
			);
		} catch { history = []; }
	}

	function fmt(m: any): string {
		const d = DISPLAY[m.metric_type];
		if (d?.fmt) return d.fmt(Number(m.value));
		return `${Number(m.value).toLocaleString()} ${d?.unit ?? m.unit ?? ''}`;
	}

	function label(type: string): string { return DISPLAY[type]?.label ?? type.replace('_', ' '); }

	function sparkline(data: any[]): string {
		if (data.length < 2) return '';
		const vals = data.map(d => Number(d.value));
		const min = Math.min(...vals), max = Math.max(...vals);
		const range = max - min || 1;
		const w = 200, h = 40;
		const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * h}`);
		return `<svg viewBox="0 0 ${w} ${h}" class="spark"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2"/></svg>`;
	}

	function timeAgo(ts: string): string {
		const diff = Date.now() - new Date(ts).getTime();
		const hrs = Math.floor(diff / 3600000);
		if (hrs < 1) return 'just now';
		if (hrs < 24) return `${hrs}h ago`;
		return `${Math.floor(hrs / 24)}d ago`;
	}

	$effect(() => { load(); });
</script>

<h1>Health</h1>

{#if error}
	<p class="error">{error}</p>
{:else if latest.length === 0}
	<p class="muted">No health data found.</p>
{:else}
	<ul class="metric-list">
		{#each latest as m}
			<li>
				<button class="metric-row" onclick={() => loadHistory(m.metric_type)}>
					<span class="metric-label">{label(m.metric_type)}</span>
					<span class="metric-right">
						<span class="metric-val">{fmt(m)}</span>
						<span class="metric-ago">{timeAgo(m.recorded_at)}</span>
					</span>
				</button>
				{#if expanded === m.metric_type && history.length > 1}
					<div class="spark-wrap">{@html sparkline(history)}</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 { font-size: 1.4rem; margin-bottom: 1rem; }
	.error { color: var(--danger); }
	.muted { color: var(--text-secondary); }
	.metric-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.metric-list li { background: var(--bg-card); border-radius: 8px; overflow: hidden; }
	.metric-row {
		width: 100%; display: flex; justify-content: space-between; align-items: center;
		padding: 0.75rem 1rem; background: none; border: none; color: inherit; cursor: pointer;
	}
	.metric-label { text-transform: capitalize; color: var(--text-secondary); font-size: 0.85rem; }
	.metric-right { display: flex; gap: 0.75rem; align-items: baseline; }
	.metric-val { font-weight: 600; font-variant-numeric: tabular-nums; }
	.metric-ago { font-size: 0.7rem; color: var(--text-secondary); }
	.spark-wrap { padding: 0.25rem 1rem 0.75rem; }
	.spark-wrap :global(.spark) { width: 100%; height: 40px; }
</style>
