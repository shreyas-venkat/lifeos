<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { PantryItem } from '$lib/api';

	let items = $state<PantryItem[]>([]);
	let loading = $state(true);
	let uploading = $state(false);

	const sevenDays = 7 * 24 * 60 * 60 * 1000;

	// Group items by category
	const grouped = $derived(() => {
		const groups: Record<string, PantryItem[]> = {};
		for (const item of items) {
			const cat = item.category ?? 'Other';
			if (!groups[cat]) groups[cat] = [];
			groups[cat].push(item);
		}
		return groups;
	});

	const expiringSoonCount = $derived(
		items.filter((i) => {
			if (!i.expiry_date) return false;
			const diff = new Date(i.expiry_date).getTime() - Date.now();
			return diff > 0 && diff < sevenDays;
		}).length
	);

	const expiredCount = $derived(
		items.filter((i) => {
			if (!i.expiry_date) return false;
			return new Date(i.expiry_date).getTime() < Date.now();
		}).length
	);

	function expiryStatus(expiryDate: string | null): 'fresh' | 'warning' | 'expired' | 'none' {
		if (!expiryDate) return 'none';
		const diff = new Date(expiryDate).getTime() - Date.now();
		if (diff < 0) return 'expired';
		if (diff < sevenDays) return 'warning';
		return 'fresh';
	}

	function formatExpiry(expiryDate: string | null): string {
		if (!expiryDate) return '';
		const d = new Date(expiryDate);
		const diff = d.getTime() - Date.now();
		const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
		if (days < 0) return `${Math.abs(days)}d ago`;
		if (days === 0) return 'Today';
		if (days === 1) return 'Tomorrow';
		return `${days}d`;
	}

	onMount(async () => {
		items = await api.pantry.list();
		loading = false;
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
			// Upload failed
		} finally {
			uploading = false;
		}
	}
</script>

<svelte:head>
	<title>Pantry - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Pantry</h1>

	{#if loading}
		<div class="skeleton" style="height: 60px; margin-bottom: 1rem;"></div>
		{#each Array(3) as _}
			<div class="skeleton" style="height: 50px; margin-bottom: 0.5rem;"></div>
		{/each}
	{:else if items.length === 0}
		<div class="empty-state fade-in">
			<p>Pantry is empty.</p>
			<p class="empty-hint">Add items via Discord or snap a photo.</p>
		</div>
	{:else}
		<!-- Summary bar -->
		<div class="summary-bar fade-in">
			<span class="summary-stat">{items.length} items</span>
			{#if expiringSoonCount > 0}
				<span class="summary-badge warning-badge">{expiringSoonCount} expiring</span>
			{/if}
			{#if expiredCount > 0}
				<span class="summary-badge danger-badge">{expiredCount} expired</span>
			{/if}
		</div>

		<!-- Grouped items -->
		{#each Object.entries(grouped()) as [category, categoryItems]}
			<section class="category-section fade-in">
				<h2>{category}</h2>
				<div class="item-list">
					{#each categoryItems as item}
						{@const status = expiryStatus(item.expiry_date)}
						<div class="item-row" class:item-warning={status === 'warning'} class:item-expired={status === 'expired'}>
							<div class="item-left">
								<span class="item-name">{item.item}</span>
								<span class="item-qty">
									{#if item.quantity !== null}
										{item.quantity}{item.unit ? ` ${item.unit}` : ''}
									{/if}
								</span>
							</div>
							<div class="item-right">
								{#if status === 'expired'}
									<span class="expiry-badge danger">Expired</span>
								{:else if status === 'warning'}
									<span class="expiry-badge warning">{formatExpiry(item.expiry_date)}</span>
								{:else if status === 'fresh'}
									<span class="expiry-badge fresh">{formatExpiry(item.expiry_date)}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}

	<!-- FAB for photo upload -->
	<label class="fab" class:uploading>
		{#if uploading}
			<span class="fab-spinner"></span>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
				<circle cx="12" cy="13" r="4"/>
			</svg>
		{/if}
		<input
			type="file"
			accept="image/*"
			capture="environment"
			onchange={handlePhotoUpload}
			hidden
			disabled={uploading}
		/>
	</label>
</div>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 1.25rem;
	}

	.summary-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 1.25rem;
		padding: 10px 14px;
		background: var(--bg-card);
		border-radius: 12px;
		border: 1px solid var(--border);
	}

	.summary-stat {
		font-size: 0.9rem;
		font-weight: 600;
	}

	.summary-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 6px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.warning-badge {
		background: rgba(245, 158, 11, 0.15);
		color: var(--warning);
	}

	.danger-badge {
		background: rgba(239, 68, 68, 0.15);
		color: var(--danger);
	}

	.category-section {
		margin-bottom: 1.25rem;
	}

	.category-section h2 {
		font-size: 0.75rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		margin-bottom: 8px;
		padding-left: 4px;
	}

	.item-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.item-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-card);
		border-radius: 10px;
		padding: 10px 14px;
		border: 1px solid var(--border);
		transition: border-color 0.2s;
	}

	.item-row.item-warning {
		border-left: 3px solid var(--warning);
	}

	.item-row.item-expired {
		border-left: 3px solid var(--danger);
		opacity: 0.7;
	}

	.item-left {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.item-name {
		font-size: 0.9rem;
		font-weight: 500;
	}

	.item-qty {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.item-right {
		display: flex;
		align-items: center;
	}

	.expiry-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 6px;
	}

	.expiry-badge.fresh {
		background: rgba(34, 197, 94, 0.12);
		color: var(--success);
	}

	.expiry-badge.warning {
		background: rgba(245, 158, 11, 0.12);
		color: var(--warning);
	}

	.expiry-badge.danger {
		background: rgba(239, 68, 68, 0.12);
		color: var(--danger);
	}

	.fab {
		position: fixed;
		bottom: 72px;
		right: 20px;
		width: 52px;
		height: 52px;
		background: var(--accent);
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
		transition: transform 0.2s, opacity 0.2s;
		z-index: 50;
	}

	.fab:hover {
		transform: scale(1.05);
	}

	.fab.uploading {
		opacity: 0.7;
		pointer-events: none;
	}

	.fab svg {
		width: 22px;
		height: 22px;
		color: white;
	}

	.fab-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
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
