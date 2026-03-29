<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import type { HealthToday, CalorieEntry, Supplement, PantryItem } from '$lib/api';

	let health = $state<HealthToday | null>(null);
	let calories = $state<CalorieEntry | null>(null);
	let supplements = $state<Supplement[]>([]);
	let pantryAlerts = $state<PantryItem[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			const [h, c, s, p] = await Promise.allSettled([
				api.health.today(),
				api.calories.today(),
				api.supplements.today(),
				api.pantry.list(),
			]);
			if (h.status === 'fulfilled') health = h.value || null;
			if (c.status === 'fulfilled') calories = c.value || null;
			if (s.status === 'fulfilled') supplements = s.value || [];
			if (p.status === 'fulfilled' && Array.isArray(p.value)) {
				const now = Date.now();
				const threeDays = 3 * 24 * 60 * 60 * 1000;
				pantryAlerts = p.value.filter(
					(item) => item.expiry && new Date(item.expiry).getTime() - now < threeDays
				);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load dashboard';
		} finally {
			loading = false;
		}
	});

	const suppsTaken = $derived(supplements.filter((s) => s.taken).length);
</script>

<svelte:head>
	<title>LifeOS</title>
</svelte:head>

<div class="dashboard">
	<h1>LifeOS</h1>

	{#if loading}
		<p class="loading">Loading dashboard...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		<div class="cards">
			<a href="{base}/health" class="card">
				<h2>Health</h2>
				{#if health}
					<div class="stat">{health.steps.toLocaleString()} steps</div>
					<div class="stat-secondary">
						HR {health.heart_rate} | HRV {health.hrv} | {health.sleep_hours}h sleep
					</div>
				{:else}
					<div class="stat-secondary">No data yet</div>
				{/if}
			</a>

			<a href="{base}/meals" class="card">
				<h2>Calories</h2>
				{#if calories}
					<div class="stat">{calories.total} / {calories.target} kcal</div>
					<div class="progress-bar">
						<div
							class="progress-fill"
							style="width: {Math.min((calories.total / calories.target) * 100, 100)}%"
						></div>
					</div>
				{:else}
					<div class="stat-secondary">No data yet</div>
				{/if}
			</a>

			<a href="{base}/supplements" class="card">
				<h2>Supplements</h2>
				{#if supplements.length > 0}
					<div class="stat">{suppsTaken} / {supplements.length} taken</div>
					<div class="progress-bar">
						<div
							class="progress-fill success"
							style="width: {(suppsTaken / supplements.length) * 100}%"
						></div>
					</div>
				{:else}
					<div class="stat-secondary">No supplements today</div>
				{/if}
			</a>

			<a href="{base}/pantry" class="card">
				<h2>Pantry</h2>
				{#if pantryAlerts.length > 0}
					<div class="stat warning">{pantryAlerts.length} expiring soon</div>
					<div class="stat-secondary">
						{pantryAlerts
							.slice(0, 3)
							.map((i) => i.name)
							.join(', ')}
					</div>
				{:else}
					<div class="stat-secondary">All items fresh</div>
				{/if}
			</a>
		</div>
	{/if}
</div>

<style>
	.dashboard h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}
	.cards {
		display: grid;
		gap: 1rem;
	}
	.card {
		background: var(--bg-card);
		border-radius: 0.75rem;
		padding: 1rem;
		color: var(--text-primary);
		display: block;
	}
	.card h2 {
		font-size: 0.85rem;
		color: var(--text-secondary);
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.stat {
		font-size: 1.25rem;
		font-weight: 600;
	}
	.stat-secondary {
		font-size: 0.8rem;
		color: var(--text-secondary);
		margin-top: 0.25rem;
	}
	.warning {
		color: var(--warning);
	}
	.progress-bar {
		height: 4px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		margin-top: 0.5rem;
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: var(--accent-light);
		border-radius: 2px;
		transition: width 0.3s;
	}
	.progress-fill.success {
		background: var(--success);
	}
	.loading,
	.error {
		text-align: center;
		padding: 2rem;
		color: var(--text-secondary);
	}
	.error {
		color: var(--danger);
	}
</style>
