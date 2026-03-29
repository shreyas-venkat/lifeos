<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { PantryItem } from '$lib/api';

	let items = $state<PantryItem[]>([]);
	let loading = $state(true);
	let error = $state('');
	let uploading = $state(false);

	const threeDays = 3 * 24 * 60 * 60 * 1000;

	const categories = $derived(() => {
		const groups: Record<string, PantryItem[]> = {};
		for (const item of items) {
			const cat = item.category || 'Other';
			if (!groups[cat]) groups[cat] = [];
			groups[cat].push(item);
		}
		return groups;
	});

	function isExpiringSoon(expiry: string): boolean {
		return new Date(expiry).getTime() - Date.now() < threeDays;
	}

	function isExpired(expiry: string): boolean {
		return new Date(expiry).getTime() < Date.now();
	}

	onMount(async () => {
		try {
			items = await api.pantry.list();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load pantry';
		} finally {
			loading = false;
		}
	});

	async function handlePhotoUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploading = true;
		try {
			const reader = new FileReader();
			const base64 = await new Promise<string>((resolve, reject) => {
				reader.onload = () => resolve((reader.result as string).split(',')[1]);
				reader.onerror = reject;
				reader.readAsDataURL(file);
			});
			await api.pantry.uploadPhoto(base64);
			items = await api.pantry.list();
		} catch {
			// Upload failed silently
		} finally {
			uploading = false;
		}
	}
</script>

<svelte:head>
	<title>Pantry - LifeOS</title>
</svelte:head>

<div class="page">
	<div class="header">
		<h1>Pantry</h1>
		<label class="upload-btn">
			{uploading ? 'Uploading...' : 'Scan'}
			<input
				type="file"
				accept="image/*"
				capture="environment"
				onchange={handlePhotoUpload}
				hidden
			/>
		</label>
	</div>

	{#if loading}
		<p class="loading">Loading pantry...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		{#each Object.entries(categories()) as [category, categoryItems]}
			<section class="category">
				<h2>{category}</h2>
				<div class="item-list">
					{#each categoryItems as item}
						<div
							class="item"
							class:expiring={isExpiringSoon(item.expiry) && !isExpired(item.expiry)}
							class:expired={isExpired(item.expiry)}
						>
							<div class="item-info">
								<span class="item-name">{item.name}</span>
								<span class="item-qty">{item.quantity}</span>
							</div>
							<div class="item-expiry">
								{#if isExpired(item.expiry)}
									<span class="badge expired-badge">Expired</span>
								{:else if isExpiringSoon(item.expiry)}
									<span class="badge expiring-badge">Expiring</span>
								{/if}
								<span class="expiry-date">{new Date(item.expiry).toLocaleDateString()}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
		{#if items.length === 0}
			<p class="no-data">Pantry is empty. Scan a receipt to add items.</p>
		{/if}
	{/if}
</div>

<style>
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	.header h1 {
		font-size: 1.5rem;
	}
	.upload-btn {
		background: var(--accent);
		color: var(--text-primary);
		border: none;
		border-radius: 0.5rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.category {
		margin-bottom: 1.5rem;
	}
	.category h2 {
		font-size: 0.85rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}
	.item-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.item {
		background: var(--bg-card);
		border-radius: 0.5rem;
		padding: 0.6rem 0.75rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.item.expiring {
		border-left: 3px solid var(--warning);
	}
	.item.expired {
		border-left: 3px solid var(--danger);
		opacity: 0.7;
	}
	.item-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.item-name {
		font-size: 0.9rem;
	}
	.item-qty {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}
	.item-expiry {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}
	.expiry-date {
		color: var(--text-secondary);
	}
	.badge {
		padding: 0.15rem 0.4rem;
		border-radius: 0.25rem;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
	}
	.expiring-badge {
		background: rgba(255, 152, 0, 0.2);
		color: var(--warning);
	}
	.expired-badge {
		background: rgba(244, 67, 54, 0.2);
		color: var(--danger);
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
