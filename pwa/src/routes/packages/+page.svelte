<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { Package } from '$lib/api';

	let packages = $state<Package[]>([]);
	let loading = $state(true);

	// Add form state
	let showAddForm = $state(false);
	let addForm = $state({
		merchant: '',
		tracking_number: '',
		carrier: '',
		expected_delivery: '',
	});
	let addSubmitting = $state(false);

	const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
		ordered: { label: 'Ordered', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
		shipped: { label: 'Shipped', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
		'in-transit': { label: 'In Transit', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
		'out-for-delivery': { label: 'Out for Delivery', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
		delivered: { label: 'Delivered', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
	};

	function getStatusConfig(status: string) {
		return STATUS_CONFIG[status] || STATUS_CONFIG.shipped;
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'No date';
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function isArrivingSoon(dateStr: string | null): boolean {
		if (!dateStr) return false;
		const d = new Date(dateStr + 'T00:00:00');
		const now = new Date();
		const diffMs = d.getTime() - now.getTime();
		const diffDays = diffMs / (1000 * 60 * 60 * 24);
		return diffDays >= 0 && diffDays <= 2;
	}

	async function fetchData() {
		packages = await api.packages.active();
	}

	onMount(async () => {
		await fetchData();
		loading = false;
	});

	async function submitAdd() {
		if (addSubmitting || !addForm.merchant.trim()) return;
		addSubmitting = true;
		try {
			await api.packages.add({
				merchant: addForm.merchant.trim(),
				tracking_number: addForm.tracking_number.trim() || undefined,
				carrier: addForm.carrier.trim() || undefined,
				expected_delivery: addForm.expected_delivery || undefined,
			});
			await fetchData();
			showAddForm = false;
			addForm = { merchant: '', tracking_number: '', carrier: '', expected_delivery: '' };
		} catch {
			// Submit failed
		} finally {
			addSubmitting = false;
		}
	}

	async function markDelivered(id: string) {
		try {
			await api.packages.updateStatus(id, 'delivered');
			packages = packages.filter((p) => p.id !== id);
		} catch {
			// Update failed
		}
	}
</script>

<svelte:head>
	<title>Packages - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Packages</h1>

	{#if loading}
		{#each Array(3) as _}
			<div class="skeleton-item">
				<div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
					<div class="skeleton" style="height: 14px; width: 55%; border-radius: 4px;"></div>
					<div class="skeleton" style="height: 10px; width: 35%; border-radius: 4px;"></div>
				</div>
				<div class="skeleton" style="width: 60px; height: 20px; border-radius: 4px;"></div>
			</div>
		{/each}
	{:else if packages.length === 0}
		<div class="empty-state fade-in">
			<div class="empty-icon">{'\u{1F4E6}'}</div>
			<p>No active packages.</p>
			<p class="empty-hint">LifeOS auto-detects shipping confirmations from your email, or tap + to add manually.</p>
		</div>
	{:else}
		<div class="pkg-list fade-in">
			{#each packages as pkg (pkg.id)}
				{@const config = getStatusConfig(pkg.status)}
				<div class="pkg-card" class:arriving-soon={isArrivingSoon(pkg.expected_delivery)}>
					<div class="pkg-info">
						<div class="pkg-header">
							<span class="pkg-merchant">{pkg.merchant}</span>
							<span class="status-badge" style="color: {config.color}; background: {config.bg};">{config.label}</span>
						</div>
						<div class="pkg-meta">
							{#if pkg.carrier}
								<span class="pkg-carrier">{pkg.carrier}</span>
							{/if}
							{#if pkg.tracking_number}
								<span class="pkg-tracking">{pkg.tracking_number}</span>
							{/if}
						</div>
						<div class="pkg-footer">
							{#if pkg.expected_delivery}
								<span class="pkg-delivery" class:arriving-text={isArrivingSoon(pkg.expected_delivery)}>
									Expected {formatDate(pkg.expected_delivery)}
								</span>
							{/if}
							<button class="mark-delivered-btn" onclick={() => markDelivered(pkg.id)}>
								Mark Delivered
							</button>
						</div>
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
					<h3>Add Package</h3>
					<button class="form-close" onclick={() => (showAddForm = false)} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<form onsubmit={(e) => { e.preventDefault(); submitAdd(); }}>
					<label class="form-field">
						<span>Merchant</span>
						<input type="text" bind:value={addForm.merchant} placeholder="e.g. Amazon" required />
					</label>
					<label class="form-field">
						<span>Tracking Number</span>
						<input type="text" bind:value={addForm.tracking_number} placeholder="Optional" />
					</label>
					<label class="form-field">
						<span>Carrier</span>
						<input type="text" bind:value={addForm.carrier} placeholder="e.g. UPS, FedEx" />
					</label>
					<label class="form-field">
						<span>Expected Delivery</span>
						<input type="date" bind:value={addForm.expected_delivery} />
					</label>
					<button type="submit" class="form-submit" disabled={addSubmitting}>
						{addSubmitting ? 'Adding...' : 'Add Package'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- FAB "+" -->
	<button class="fab" onclick={() => (showAddForm = true)} aria-label="Add package">
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

	.pkg-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.pkg-card {
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		transition: border-color 0.2s;
	}

	.pkg-card.arriving-soon {
		border-color: var(--success, #22c55e);
		background: rgba(34, 197, 94, 0.04);
	}

	.pkg-info {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.pkg-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}

	.pkg-merchant {
		font-size: 0.95rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.status-badge {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 6px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.pkg-meta {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 0.78rem;
		color: var(--text-secondary);
		flex-wrap: wrap;
	}

	.pkg-tracking {
		font-family: monospace;
		font-size: 0.72rem;
		background: var(--bg-elevated);
		padding: 1px 6px;
		border-radius: 4px;
	}

	.pkg-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 4px;
	}

	.pkg-delivery {
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.pkg-delivery.arriving-text {
		color: var(--success, #22c55e);
		font-weight: 600;
	}

	.mark-delivered-btn {
		font-size: 0.72rem;
		color: var(--accent);
		background: var(--accent-glow, rgba(99, 102, 241, 0.1));
		border: none;
		padding: 4px 10px;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
	}

	.mark-delivered-btn:hover {
		opacity: 0.8;
	}

	/* Empty state */
	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--text-secondary);
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 0.75rem;
	}

	.empty-hint {
		font-size: 0.85rem;
		margin-top: 0.5rem;
		opacity: 0.7;
		max-width: 280px;
		margin-left: auto;
		margin-right: auto;
	}

	/* Skeleton */
	.skeleton-item {
		display: flex;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		margin-bottom: 8px;
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
	}

	.form-field span {
		font-size: 0.75rem;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.form-field input {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 12px;
		color: var(--text-primary);
		font-size: 0.9rem;
	}

	.form-field input:focus {
		outline: none;
		border-color: var(--accent);
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
</style>
