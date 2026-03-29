<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { PreferenceRow } from '$lib/api';

	let preferences = $state<PreferenceRow[]>([]);
	let loading = $state(true);
	let editingKey = $state<string | null>(null);
	let editValue = $state('');
	let saving = $state(false);

	// Group preferences by skill
	const grouped = $derived(() => {
		const groups: Record<string, PreferenceRow[]> = {};
		for (const pref of preferences) {
			const section = pref.skill || 'General';
			if (!groups[section]) groups[section] = [];
			groups[section].push(pref);
		}
		return groups;
	});

	function startEdit(pref: PreferenceRow) {
		editingKey = pref.key;
		editValue = pref.value;
	}

	async function saveEdit(key: string) {
		saving = true;
		try {
			await api.preferences.update({ [key]: editValue });
			const idx = preferences.findIndex((p) => p.key === key);
			if (idx >= 0) {
				preferences[idx].value = editValue;
				preferences = [...preferences];
			}
			editingKey = null;
		} catch {
			// Failed to save
		} finally {
			saving = false;
		}
	}

	function cancelEdit() {
		editingKey = null;
		editValue = '';
	}

	function formatKey(key: string): string {
		return key
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	onMount(async () => {
		preferences = await api.preferences.get();
		loading = false;
	});
</script>

<svelte:head>
	<title>Preferences - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Preferences</h1>

	{#if loading}
		{#each Array(5) as _}
			<div class="skeleton" style="height: 56px; margin-bottom: 0.5rem;"></div>
		{/each}
	{:else if preferences.length === 0}
		<div class="empty-state fade-in">
			<p>No preferences configured yet.</p>
			<p class="empty-hint">Preferences will appear here as you configure LifeOS via Discord.</p>
		</div>
	{:else}
		{#each Object.entries(grouped()) as [section, prefs]}
			<section class="pref-section fade-in">
				<h2>{section}</h2>
				<div class="pref-list">
					{#each prefs as pref}
						<div class="pref-row">
							{#if editingKey === pref.key}
								<div class="pref-edit">
									<span class="pref-key">{formatKey(pref.key)}</span>
									<input
										type="text"
										bind:value={editValue}
										class="pref-input"
										onkeydown={(e) => {
											if (e.key === 'Enter') saveEdit(pref.key);
											if (e.key === 'Escape') cancelEdit();
										}}
									/>
									<div class="edit-actions">
										<button
											class="save-btn"
											onclick={() => saveEdit(pref.key)}
											disabled={saving}
										>
											{saving ? '...' : 'Save'}
										</button>
										<button class="cancel-btn" onclick={cancelEdit}>
											Cancel
										</button>
									</div>
								</div>
							{:else}
								<button class="pref-display" onclick={() => startEdit(pref)}>
									<span class="pref-key">{formatKey(pref.key)}</span>
									<span class="pref-value">{pref.value}</span>
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 1.25rem;
	}

	.pref-section {
		margin-bottom: 1.5rem;
	}

	.pref-section h2 {
		font-size: 0.75rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		margin-bottom: 8px;
		padding-left: 4px;
	}

	.pref-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.pref-row {
		background: var(--bg-card);
		border-radius: 10px;
		border: 1px solid var(--border);
		overflow: hidden;
	}

	.pref-display {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 14px;
		background: none;
		border: none;
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
		transition: background 0.2s;
	}

	.pref-display:hover {
		background: var(--bg-elevated);
	}

	.pref-key {
		font-size: 0.85rem;
		font-weight: 500;
	}

	.pref-value {
		font-size: 0.85rem;
		color: var(--text-secondary);
		max-width: 60%;
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pref-edit {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.pref-input {
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 12px;
		color: var(--text-primary);
		font-size: 0.9rem;
		transition: border-color 0.2s;
	}

	.pref-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.edit-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	.save-btn {
		background: var(--accent);
		color: var(--text-primary);
		border: none;
		border-radius: 8px;
		padding: 6px 16px;
		font-size: 0.8rem;
		font-weight: 500;
		transition: opacity 0.2s;
	}

	.save-btn:disabled {
		opacity: 0.6;
	}

	.cancel-btn {
		background: none;
		color: var(--text-secondary);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px 16px;
		font-size: 0.8rem;
		font-weight: 500;
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
