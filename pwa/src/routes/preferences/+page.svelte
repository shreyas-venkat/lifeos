<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';

	let dietary = $state('');
	let notifications = $state(false);
	let supplementList = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let saved = $state(false);

	onMount(async () => {
		try {
			const prefs = await api.preferences.get();
			dietary = prefs.dietary || '';
			notifications = prefs.notifications ?? false;
			supplementList = (prefs.supplements || []).join(', ');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load preferences';
		} finally {
			loading = false;
		}
	});

	async function savePreferences() {
		saving = true;
		saved = false;
		try {
			await api.preferences.update({
				dietary,
				notifications: String(notifications),
				supplements: supplementList,
			});
			saved = true;
			setTimeout(() => (saved = false), 2000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Preferences - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Preferences</h1>

	{#if loading}
		<p class="loading">Loading preferences...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		<form onsubmit={(e) => { e.preventDefault(); savePreferences(); }}>
			<div class="field">
				<label for="dietary">Dietary Preferences</label>
				<textarea
					id="dietary"
					bind:value={dietary}
					placeholder="e.g., vegetarian, low-carb, no dairy..."
					rows="3"
				></textarea>
			</div>

			<div class="field">
				<label for="supplements">Supplement List</label>
				<textarea
					id="supplements"
					bind:value={supplementList}
					placeholder="e.g., Vitamin D, Omega-3, Magnesium..."
					rows="3"
				></textarea>
				<span class="hint">Comma-separated list</span>
			</div>

			<div class="field toggle-field">
				<label for="notifications">Notifications</label>
				<label class="toggle">
					<input type="checkbox" id="notifications" bind:checked={notifications} />
					<span class="toggle-slider"></span>
				</label>
			</div>

			<button type="submit" class="save-btn" disabled={saving}>
				{#if saving}
					Saving...
				{:else if saved}
					Saved
				{:else}
					Save Preferences
				{/if}
			</button>
		</form>
	{/if}
</div>

<style>
	.page h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.field label {
		font-size: 0.85rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	textarea {
		background: var(--bg-card);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		padding: 0.6rem;
		color: var(--text-primary);
		font-size: 0.9rem;
		font-family: inherit;
		resize: vertical;
	}
	textarea::placeholder {
		color: var(--text-secondary);
	}
	.hint {
		font-size: 0.7rem;
		color: var(--text-secondary);
	}
	.toggle-field {
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-card);
		border-radius: 0.5rem;
		padding: 0.75rem;
	}
	.toggle {
		position: relative;
		display: inline-block;
		width: 44px;
		height: 24px;
	}
	.toggle input {
		opacity: 0;
		width: 0;
		height: 0;
	}
	.toggle-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		transition: 0.3s;
	}
	.toggle-slider::before {
		content: '';
		position: absolute;
		height: 18px;
		width: 18px;
		left: 3px;
		bottom: 3px;
		background: white;
		border-radius: 50%;
		transition: 0.3s;
	}
	.toggle input:checked + .toggle-slider {
		background: var(--success);
	}
	.toggle input:checked + .toggle-slider::before {
		transform: translateX(20px);
	}
	.save-btn {
		background: var(--accent);
		color: var(--text-primary);
		border: none;
		border-radius: 0.5rem;
		padding: 0.75rem;
		font-size: 0.95rem;
		cursor: pointer;
		font-weight: 500;
	}
	.save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
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
