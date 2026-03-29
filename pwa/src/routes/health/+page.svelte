<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { HealthToday, HealthTrend } from '$lib/api';
	import Chart from 'chart.js/auto';

	let today = $state<HealthToday | null>(null);
	let trends = $state<HealthTrend[]>([]);
	let loading = $state(true);
	let error = $state('');
	let chartCanvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance: Chart | null = null;

	onMount(async () => {
		try {
			const [t, tr] = await Promise.allSettled([
				api.health.today(),
				api.health.trends(7),
			]);
			if (t.status === 'fulfilled') today = Array.isArray(t.value) ? null : t.value;
			if (tr.status === 'fulfilled') trends = Array.isArray(tr.value) ? tr.value : [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load health data';
		} finally {
			loading = false;
		}
	});

	$effect(() => {
		if (chartCanvas && trends.length > 0) {
			if (chartInstance) chartInstance.destroy();
			chartInstance = new Chart(chartCanvas, {
				type: 'line',
				data: {
					labels: trends.map((t) => t.date.slice(5)),
					datasets: [
						{
							label: 'Steps',
							data: trends.map((t) => t.steps),
							borderColor: '#533483',
							yAxisID: 'y',
							tension: 0.3,
						},
						{
							label: 'HR',
							data: trends.map((t) => t.heart_rate),
							borderColor: '#f44336',
							yAxisID: 'y1',
							tension: 0.3,
						},
						{
							label: 'Sleep (h)',
							data: trends.map((t) => t.sleep_hours),
							borderColor: '#4caf50',
							yAxisID: 'y1',
							tension: 0.3,
						},
					],
				},
				options: {
					responsive: true,
					interaction: { mode: 'index', intersect: false },
					plugins: {
						legend: { labels: { color: '#a0a0a0' } },
					},
					scales: {
						x: { ticks: { color: '#a0a0a0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
						y: {
							position: 'left',
							ticks: { color: '#a0a0a0' },
							grid: { color: 'rgba(255,255,255,0.05)' },
						},
						y1: {
							position: 'right',
							ticks: { color: '#a0a0a0' },
							grid: { display: false },
						},
					},
				},
			});
		}
		return () => {
			if (chartInstance) chartInstance.destroy();
		};
	});
</script>

<svelte:head>
	<title>Health - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Health</h1>

	{#if loading}
		<p class="loading">Loading health data...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		{#if today}
			<div class="vitals">
				<div class="vital-card">
					<span class="vital-label">Steps</span>
					<span class="vital-value">{today.steps.toLocaleString()}</span>
				</div>
				<div class="vital-card">
					<span class="vital-label">Heart Rate</span>
					<span class="vital-value">{today.heart_rate} bpm</span>
				</div>
				<div class="vital-card">
					<span class="vital-label">HRV</span>
					<span class="vital-value">{today.hrv} ms</span>
				</div>
				<div class="vital-card">
					<span class="vital-label">SpO2</span>
					<span class="vital-value">{today.spo2}%</span>
				</div>
				<div class="vital-card">
					<span class="vital-label">Weight</span>
					<span class="vital-value">{today.weight} kg</span>
				</div>
				<div class="vital-card">
					<span class="vital-label">Sleep</span>
					<span class="vital-value">{today.sleep_hours}h</span>
				</div>
			</div>
		{:else}
			<p class="no-data">No vitals recorded today</p>
		{/if}

		{#if trends.length > 0}
			<div class="chart-container">
				<h2>7-Day Trends</h2>
				<canvas bind:this={chartCanvas}></canvas>
			</div>
		{/if}
	{/if}
</div>

<style>
	.page h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}
	.vitals {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.vital-card {
		background: var(--bg-card);
		border-radius: 0.75rem;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.vital-label {
		font-size: 0.75rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.vital-value {
		font-size: 1.25rem;
		font-weight: 600;
	}
	.chart-container {
		background: var(--bg-card);
		border-radius: 0.75rem;
		padding: 1rem;
	}
	.chart-container h2 {
		font-size: 0.85rem;
		color: var(--text-secondary);
		margin-bottom: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
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
