<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { SupplementWithStatus } from '$lib/api';

	let supplements = $state<SupplementWithStatus[]>([]);
	let loading = $state(true);

	// Add form state
	let showAddForm = $state(false);
	let addForm = $state({
		name: '',
		dosage: 0,
		unit: 'mg' as string,
		time_of_day: 'morning' as string,
	});
	let addSubmitting = $state(false);

	const unitOptions = ['mg', 'IU', 'g'];
	const timeOptions = ['morning', 'evening'];

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

	function formatDosage(supp: SupplementWithStatus): string {
		const dosage = supp.default_dosage;
		const unit = supp.unit;
		return `1 tab (${dosage}${unit})`;
	}

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

	async function submitAdd() {
		if (addSubmitting || !addForm.name.trim()) return;
		addSubmitting = true;
		try {
			await api.supplements.add({
				name: addForm.name.trim(),
				dosage: addForm.dosage,
				unit: addForm.unit,
				time_of_day: addForm.time_of_day,
			});
			supplements = await api.supplements.today();
			showAddForm = false;
			addForm = { name: '', dosage: 0, unit: 'mg', time_of_day: 'morning' };
		} catch {
			// Submit failed
		} finally {
			addSubmitting = false;
		}
	}

	async function deleteSupplement(id: string) {
		try {
			await api.supplements.remove(id);
			supplements = supplements.filter((s) => s.supplement_id !== id);
		} catch {
			// Delete failed
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
	{:else if total === 0 && !showAddForm}
		<div class="empty-state fade-in">
			<p>No supplements configured.</p>
			<p class="empty-hint">Tap + to add your supplement stack.</p>
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
							<span>{formatDosage(supp)}</span>
							<span class="supp-time">{supp.time_of_day}</span>
						</div>
						{#if supp.reason}
							<span class="supp-reason">{supp.reason}</span>
						{/if}
					</div>
					<div class="supp-actions">
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
						<button
							class="delete-btn"
							onclick={() => deleteSupplement(supp.supplement_id)}
							title="Delete supplement"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Add Form Overlay -->
	{#if showAddForm}
		<div class="form-overlay fade-in" role="dialog">
			<div class="form-card">
				<div class="form-header">
					<h3>Add Supplement</h3>
					<button class="form-close" onclick={() => (showAddForm = false)} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<form onsubmit={(e) => { e.preventDefault(); submitAdd(); }}>
					<label class="form-field">
						<span>Name</span>
						<input type="text" bind:value={addForm.name} placeholder="e.g. Vitamin D3" required />
					</label>
					<div class="form-row">
						<label class="form-field">
							<span>Dosage</span>
							<input type="number" bind:value={addForm.dosage} min="0" step="any" />
						</label>
						<label class="form-field">
							<span>Unit</span>
							<select bind:value={addForm.unit}>
								{#each unitOptions as u}
									<option value={u}>{u}</option>
								{/each}
							</select>
						</label>
					</div>
					<label class="form-field">
						<span>Time of Day</span>
						<select bind:value={addForm.time_of_day}>
							{#each timeOptions as t}
								<option value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
							{/each}
						</select>
					</label>
					<button type="submit" class="form-submit" disabled={addSubmitting}>
						{addSubmitting ? 'Adding...' : 'Add Supplement'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- FAB "+" -->
	<button class="fab" onclick={() => (showAddForm = true)} aria-label="Add supplement">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	</button>
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

	.supp-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: 12px;
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
		cursor: pointer;
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

	.delete-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: none;
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-secondary);
		transition: color 0.2s, border-color 0.2s;
		flex-shrink: 0;
	}

	.delete-btn:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	.delete-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Form overlay */
	.form-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 100;
		padding: 0 0 env(safe-area-inset-bottom, 0);
	}

	.form-card {
		background: var(--bg-card);
		border-radius: 16px 16px 0 0;
		padding: 20px 20px 80px;
		width: 100%;
		max-width: 500px;
		max-height: 80vh;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-bottom: none;
	}

	.form-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.form-header h3 {
		font-size: 1.1rem;
		font-weight: 600;
	}

	.form-close {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-secondary);
	}

	.form-close svg {
		width: 16px;
		height: 16px;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
		flex: 1;
	}

	.form-field span {
		font-size: 0.75rem;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.form-field input,
	.form-field select {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 12px;
		color: var(--text-primary);
		font-size: 0.9rem;
	}

	.form-field input:focus,
	.form-field select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.form-row {
		display: flex;
		gap: 10px;
	}

	.form-submit {
		width: 100%;
		background: var(--accent);
		color: white;
		border: none;
		border-radius: 10px;
		padding: 12px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		margin-top: 4px;
		transition: opacity 0.2s;
	}

	.form-submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-submit:hover:not(:disabled) {
		opacity: 0.9;
	}

	/* FAB */
	.fab {
		position: fixed;
		bottom: 72px;
		right: 20px;
		width: 52px;
		height: 52px;
		background: var(--accent);
		border-radius: 16px;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
		transition: transform 0.2s;
		z-index: 50;
	}

	.fab:hover {
		transform: scale(1.05);
	}

	.fab svg {
		width: 22px;
		height: 22px;
		color: white;
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
