<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { Supplement } from '$lib/api';

	let supplements = $state<Supplement[]>([]);
	let loading = $state(true);
	let error = $state('');

	const taken = $derived(supplements.filter((s) => s.taken).length);
	const total = $derived(supplements.length);

	onMount(async () => {
		try {
			const result = await api.supplements.today();
			supplements = Array.isArray(result) ? result : [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load supplements';
		} finally {
			loading = false;
		}
	});

	async function markTaken(id: string) {
		try {
			await api.supplements.markTaken(id);
			const idx = supplements.findIndex((s) => s.id === id);
			if (idx >= 0) {
				supplements[idx].taken = true;
				supplements = [...supplements];
			}
		} catch {
			// Failed silently
		}
	}
</script>

<svelte:head>
	<title>Supplements - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Supplements</h1>

	{#if loading}
		<p class="loading">Loading supplements...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		{#if total > 0}
			<div class="summary">
				<div class="summary-text">{taken} of {total} taken today</div>
				<div class="progress-bar">
					<div class="progress-fill" style="width: {(taken / total) * 100}%"></div>
				</div>
			</div>

			<div class="supp-list">
				{#each supplements as supp}
					<div class="supp-item" class:done={supp.taken}>
						<div class="supp-info">
							<span class="supp-name">{supp.name}</span>
							<span class="supp-dosage">{supp.dosage}</span>
							{#if supp.time}
								<span class="supp-time">{supp.time}</span>
							{/if}
						</div>
						{#if supp.taken}
							<span class="taken-badge">Taken</span>
						{:else}
							<button class="take-btn" onclick={() => markTaken(supp.id)}>
								Take
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="no-data">No supplements scheduled for today</p>
		{/if}
	{/if}
</div>

<style>
	.page h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}
	.summary {
		background: var(--bg-card);
		border-radius: 0.75rem;
		padding: 1rem;
		margin-bottom: 1rem;
	}
	.summary-text {
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}
	.progress-bar {
		height: 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: var(--success);
		border-radius: 3px;
		transition: width 0.3s;
	}
	.supp-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.supp-item {
		background: var(--bg-card);
		border-radius: 0.5rem;
		padding: 0.75rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.supp-item.done {
		opacity: 0.6;
	}
	.supp-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.supp-name {
		font-size: 0.95rem;
		font-weight: 500;
	}
	.supp-dosage {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}
	.supp-time {
		font-size: 0.7rem;
		color: var(--text-secondary);
	}
	.take-btn {
		background: var(--success);
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.4rem 1rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.taken-badge {
		font-size: 0.75rem;
		color: var(--success);
		font-weight: 600;
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
