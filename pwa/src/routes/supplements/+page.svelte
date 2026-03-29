<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { SupplementWithStatus } from '$lib/api';

	let supplements = $state<SupplementWithStatus[]>([]);
	let loading = $state(true);

	const taken = $derived(supplements.filter((s) => s.taken).length);
	const total = $derived(supplements.length);
	const progress = $derived(total > 0 ? taken / total : 0);

	// Sort by time_of_day: morning < afternoon < evening < night
	const timeOrder: Record<string, number> = {
		morning: 0,
		afternoon: 1,
		evening: 2,
		night: 3,
	};

	const sorted = $derived(
		[...supplements].sort(
			(a, b) => (timeOrder[a.time_of_day] ?? 99) - (timeOrder[b.time_of_day] ?? 99)
		)
	);

	// SVG progress ring constants
	const ringSize = 140;
	const strokeWidth = 10;
	const ringRadius = (ringSize - strokeWidth) / 2;
	const ringCircumference = 2 * Math.PI * ringRadius;
	const ringOffset = $derived(ringCircumference * (1 - progress));

	// Progress ring color transitions from accent to success
	const ringColor = $derived(progress >= 1 ? 'var(--success)' : 'var(--accent)');

	onMount(async () => {
		supplements = await api.supplements.today();
		loading = false;
	});

	async function toggleTaken(supp: SupplementWithStatus) {
		try {
			await api.supplements.markTaken(supp.supplement_id);
			supp.taken = !supp.taken;
			supplements = [...supplements];
		} catch {
			// Keep current state
		}
	}
</script>

<svelte:head>
	<title>Supplements - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Supplements</h1>

	{#if loading}
		<div class="ring-placeholder">
			<div class="skeleton" style="width: 140px; height: 140px; border-radius: 50%;"></div>
		</div>
		{#each Array(4) as _}
			<div class="skeleton" style="height: 60px; margin-bottom: 0.5rem;"></div>
		{/each}
	{:else if total === 0}
		<div class="empty-state fade-in">
			<p>No supplements configured.</p>
			<p class="empty-hint">Tell LifeOS about your supplement stack via Discord.</p>
		</div>
	{:else}
		<!-- Progress Ring -->
		<div class="ring-container fade-in">
			<svg
				width={ringSize}
				height={ringSize}
				viewBox="0 0 {ringSize} {ringSize}"
			>
				<!-- Background ring -->
				<circle
					cx={ringSize / 2}
					cy={ringSize / 2}
					r={ringRadius}
					fill="none"
					stroke="var(--bg-elevated)"
					stroke-width={strokeWidth}
				/>
				<!-- Progress ring -->
				<circle
					cx={ringSize / 2}
					cy={ringSize / 2}
					r={ringRadius}
					fill="none"
					stroke={ringColor}
					stroke-width={strokeWidth}
					stroke-linecap="round"
					stroke-dasharray={ringCircumference}
					stroke-dashoffset={ringOffset}
					transform="rotate(-90 {ringSize / 2} {ringSize / 2})"
					style="transition: stroke-dashoffset 0.5s ease, stroke 0.3s ease;"
				/>
			</svg>
			<div class="ring-label">
				<span class="ring-count">{taken}/{total}</span>
				<span class="ring-text">taken</span>
			</div>
		</div>

		<!-- Supplement List -->
		<div class="supp-list fade-in">
			{#each sorted as supp}
				<div class="supp-item" class:taken-item={supp.taken}>
					<div class="supp-info">
						<span class="supp-name">{supp.name}</span>
						<div class="supp-details">
							<span>{supp.default_dosage} {supp.unit}</span>
							<span class="supp-time">{supp.time_of_day}</span>
						</div>
						{#if supp.reason}
							<span class="supp-reason">{supp.reason}</span>
						{/if}
					</div>
					<button
						class="toggle-btn"
						class:taken-btn={supp.taken}
						onclick={() => toggleTaken(supp)}
					>
						{#if supp.taken}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="20 6 9 17 4 12" />
							</svg>
						{:else}
							<span class="toggle-circle"></span>
						{/if}
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 1.25rem;
	}

	.ring-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-bottom: 1.5rem;
		position: relative;
	}

	.ring-placeholder {
		display: flex;
		justify-content: center;
		margin-bottom: 1.5rem;
	}

	.ring-label {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.ring-count {
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.ring-text {
		font-size: 0.75rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.supp-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.supp-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		transition: opacity 0.2s, border-color 0.2s;
	}

	.supp-item.taken-item {
		opacity: 0.6;
		border-color: var(--success);
	}

	.supp-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1;
		min-width: 0;
	}

	.supp-name {
		font-size: 0.95rem;
		font-weight: 600;
	}

	.supp-details {
		display: flex;
		gap: 10px;
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.supp-time {
		text-transform: capitalize;
	}

	.supp-reason {
		font-size: 0.72rem;
		color: var(--text-secondary);
		font-style: italic;
		opacity: 0.8;
	}

	.toggle-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid var(--border);
		background: none;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.2s;
		margin-left: 12px;
	}

	.toggle-btn.taken-btn {
		background: var(--success);
		border-color: var(--success);
	}

	.toggle-btn.taken-btn svg {
		width: 18px;
		height: 18px;
		color: white;
	}

	.toggle-circle {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--bg-elevated);
	}

	.toggle-btn:hover:not(.taken-btn) {
		border-color: var(--accent);
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--text-secondary);
	}

	.empty-hint {
		font-size: 0.85rem;
		margin-top: 0.5rem;
		opacity: 0.7;
	}
</style>
