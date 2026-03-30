<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { PantryItem, PantryAlerts, RecipeSuggestion } from '$lib/api';

	let items = $state<PantryItem[]>([]);
	let loading = $state(true);
	let uploading = $state(false);

	// Smart pantry state
	let alerts = $state<PantryAlerts>({ expiring: [], depleted: [], stale: [] });
	let suggestions = $state<RecipeSuggestion[]>([]);
	let showCookSection = $state(false);
	let highlightIds = $state<Set<string>>(new Set());

	// Add form state
	let showAddForm = $state(false);
	let addForm = $state({
		item: '',
		quantity: null as number | null,
		unit: 'pcs' as string,
		category: '',
		expiry_date: '',
	});
	let addSubmitting = $state(false);

	// Edit state
	let editingId = $state<string | null>(null);
	let editForm = $state({
		item: '',
		quantity: null as number | null,
		unit: 'pcs' as string,
		category: '',
		expiry_date: '',
	});
	let editSubmitting = $state(false);

	const unitOptions = ['g', 'kg', 'ml', 'L', 'pcs'];
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

	async function submitAdd() {
		if (addSubmitting || !addForm.item.trim()) return;
		addSubmitting = true;
		try {
			await api.pantry.add({
				item: addForm.item.trim(),
				quantity: addForm.quantity,
				unit: addForm.unit,
				category: addForm.category.trim() || null,
				expiry_date: addForm.expiry_date || null,
			});
			items = await api.pantry.list();
			showAddForm = false;
			addForm = { item: '', quantity: null, unit: 'pcs', category: '', expiry_date: '' };
		} catch {
			// Submit failed
		} finally {
			addSubmitting = false;
		}
	}

	async function deleteItem(id: string) {
		try {
			await api.pantry.remove(id);
			items = items.filter((i) => i.id !== id);
		} catch {
			// Delete failed
		}
	}

	function startEdit(item: PantryItem) {
		editingId = item.id;
		editForm = {
			item: item.item,
			quantity: item.quantity,
			unit: item.unit ?? 'pcs',
			category: item.category ?? '',
			expiry_date: item.expiry_date ?? '',
		};
	}

	async function submitEdit() {
		if (editSubmitting || !editingId || !editForm.item.trim()) return;
		editSubmitting = true;
		try {
			await api.pantry.update(editingId, {
				item: editForm.item.trim(),
				quantity: editForm.quantity,
				unit: editForm.unit,
				category: editForm.category.trim() || null,
				expiry_date: editForm.expiry_date || null,
			});
			items = await api.pantry.list();
			editingId = null;
		} catch {
			// Update failed
		} finally {
			editSubmitting = false;
		}
	}

	const hasAlerts = $derived(
		alerts.expiring.length > 0 || alerts.depleted.length > 0
	);

	function scrollToAlertItems() {
		const ids = new Set<string>();
		for (const item of alerts.expiring) ids.add(item.id);
		for (const item of alerts.depleted) ids.add(item.id);
		highlightIds = ids;
		// Scroll to first highlighted item
		const firstId = ids.values().next().value;
		if (firstId) {
			const el = document.getElementById(`pantry-item-${firstId}`);
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
		// Clear highlights after 3 seconds
		setTimeout(() => { highlightIds = new Set(); }, 3000);
	}

	onMount(async () => {
		const [itemsResult, alertsResult, suggestionsResult] = await Promise.all([
			api.pantry.list(),
			api.pantry.alerts(),
			api.pantry.suggestions(),
		]);
		items = itemsResult;
		alerts = alertsResult;
		suggestions = suggestionsResult;
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
	{:else if items.length === 0 && !showAddForm}
		<div class="empty-state fade-in">
			<p>Pantry is empty.</p>
			<p class="empty-hint">Tap + to add items, or snap a photo.</p>
		</div>
	{:else}
		<!-- Alerts banner -->
		{#if hasAlerts}
			<button class="alerts-banner fade-in" onclick={scrollToAlertItems}>
				{#if alerts.expiring.length > 0}
					<span class="alert-item warning-alert">{alerts.expiring.length} item{alerts.expiring.length === 1 ? '' : 's'} expiring soon</span>
				{/if}
				{#if alerts.expiring.length > 0 && alerts.depleted.length > 0}
					<span class="alert-sep">&middot;</span>
				{/if}
				{#if alerts.depleted.length > 0}
					<span class="alert-item danger-alert">{alerts.depleted.length} item{alerts.depleted.length === 1 ? '' : 's'} depleted</span>
				{/if}
			</button>
		{/if}

		<!-- What can I cook? -->
		{#if suggestions.length > 0}
			<div class="cook-section fade-in">
				<button class="cook-header" onclick={() => (showCookSection = !showCookSection)}>
					<span class="cook-title">What can I cook?</span>
					<span class="cook-chevron" class:cook-chevron-open={showCookSection}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
					</span>
				</button>
				{#if showCookSection}
					<div class="cook-list">
						{#each suggestions.slice(0, 3) as suggestion}
							<a class="cook-card" href="/meals/recipes/{suggestion.recipe.id}">
								<div class="cook-card-top">
									<span class="cook-recipe-name">{suggestion.recipe.name}</span>
									<span class="cook-match">{suggestion.match_pct}% match</span>
								</div>
								{#if suggestion.missing.length > 0}
									<div class="cook-missing">
										Missing: {suggestion.missing.join(', ')}
									</div>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

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
						{#if editingId === item.id}
							<!-- Inline edit form -->
							<form class="edit-row" onsubmit={(e) => { e.preventDefault(); submitEdit(); }}>
								<div class="edit-fields">
									<input type="text" bind:value={editForm.item} placeholder="Item name" class="edit-input" />
									<div class="edit-row-inline">
										<input type="number" bind:value={editForm.quantity} placeholder="Qty" class="edit-input edit-small" />
										<select bind:value={editForm.unit} class="edit-input edit-small">
											{#each unitOptions as u}
												<option value={u}>{u}</option>
											{/each}
										</select>
										<input type="text" bind:value={editForm.category} placeholder="Category" class="edit-input" />
									</div>
									<input type="date" bind:value={editForm.expiry_date} class="edit-input" />
								</div>
								<div class="edit-actions">
									<button type="submit" class="btn-save" disabled={editSubmitting}>Save</button>
									<button type="button" class="btn-cancel" onclick={() => (editingId = null)}>Cancel</button>
								</div>
							</form>
						{:else}
							<div
								id="pantry-item-{item.id}"
								class="item-row"
								class:item-warning={status === 'warning'}
								class:item-expired={status === 'expired'}
								class:item-highlight={highlightIds.has(item.id)}
							>
								<button class="item-tap-area" onclick={() => startEdit(item)}>
									<div class="item-left">
										<span class="item-name">{item.item}</span>
										<span class="item-qty">
											{#if item.quantity !== null}
												{item.quantity}{item.unit ? ` ${item.unit}` : ''}
											{/if}
										</span>
									</div>
								</button>
								<div class="item-right">
									{#if status === 'expired'}
										<span class="expiry-badge danger">Expired</span>
									{:else if status === 'warning'}
										<span class="expiry-badge warning">{formatExpiry(item.expiry_date)}</span>
									{:else if status === 'fresh'}
										<span class="expiry-badge fresh">{formatExpiry(item.expiry_date)}</span>
									{/if}
									<button class="delete-btn" onclick={() => deleteItem(item.id)} title="Delete item">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
									</button>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/each}
	{/if}

	<!-- Add Form Overlay -->
	{#if showAddForm}
		<div class="form-overlay fade-in" role="dialog">
			<div class="form-card">
				<div class="form-header">
					<h3>Add Pantry Item</h3>
					<button class="form-close" onclick={() => (showAddForm = false)} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<form onsubmit={(e) => { e.preventDefault(); submitAdd(); }}>
					<label class="form-field">
						<span>Item Name</span>
						<input type="text" bind:value={addForm.item} placeholder="e.g. Chicken breast" required />
					</label>
					<div class="form-row">
						<label class="form-field">
							<span>Quantity</span>
							<input type="number" bind:value={addForm.quantity} min="0" step="any" />
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
						<span>Category</span>
						<input type="text" bind:value={addForm.category} placeholder="e.g. Protein, Dairy" />
					</label>
					<label class="form-field">
						<span>Expiry Date</span>
						<input type="date" bind:value={addForm.expiry_date} />
					</label>
					<button type="submit" class="form-submit" disabled={addSubmitting}>
						{addSubmitting ? 'Adding...' : 'Add Item'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- FAB "+" -->
	<button class="fab" onclick={() => (showAddForm = true)} aria-label="Add pantry item">
		{#if uploading}
			<span class="fab-spinner"></span>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<line x1="12" y1="5" x2="12" y2="19" />
				<line x1="5" y1="12" x2="19" y2="12" />
			</svg>
		{/if}
	</button>

	<!-- Hidden photo upload (accessible via long press or separate action) -->
	<label class="photo-fab" class:uploading>
		{#if !uploading}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
				<circle cx="12" cy="13" r="4"/>
			</svg>
		{:else}
			<span class="fab-spinner"></span>
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
		padding: 0;
		border: 1px solid var(--border);
		transition: border-color 0.2s;
		overflow: hidden;
	}

	.item-row.item-warning {
		border-left: 3px solid var(--warning);
	}

	.item-row.item-expired {
		border-left: 3px solid var(--danger);
		opacity: 0.7;
	}

	.item-tap-area {
		flex: 1;
		min-width: 0;
		padding: 10px 14px;
		background: none;
		border: none;
		text-align: left;
		color: var(--text-primary);
		cursor: pointer;
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
		gap: 8px;
		padding-right: 10px;
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

	/* Inline edit form */
	.edit-row {
		background: var(--bg-card);
		border-radius: 10px;
		padding: 10px 14px;
		border: 1px solid var(--accent);
	}

	.edit-fields {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 8px;
	}

	.edit-row-inline {
		display: flex;
		gap: 6px;
	}

	.edit-input {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 6px 10px;
		color: var(--text-primary);
		font-size: 0.85rem;
		flex: 1;
		min-width: 0;
	}

	.edit-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.edit-small {
		max-width: 80px;
	}

	.edit-actions {
		display: flex;
		gap: 8px;
	}

	.btn-save {
		background: var(--accent);
		color: white;
		border: none;
		border-radius: 6px;
		padding: 6px 14px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-save:disabled {
		opacity: 0.6;
	}

	.btn-cancel {
		background: var(--bg-elevated);
		color: var(--text-secondary);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 6px 14px;
		font-size: 0.8rem;
		cursor: pointer;
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

	/* FABs */
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

	.photo-fab {
		position: fixed;
		bottom: 132px;
		right: 20px;
		width: 44px;
		height: 44px;
		background: var(--bg-card);
		border-radius: 14px;
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		transition: transform 0.2s, opacity 0.2s;
		z-index: 50;
	}

	.photo-fab:hover {
		transform: scale(1.05);
	}

	.photo-fab.uploading {
		opacity: 0.7;
		pointer-events: none;
	}

	.photo-fab svg {
		width: 18px;
		height: 18px;
		color: var(--text-primary);
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

	/* Alerts banner */
	.alerts-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 14px;
		margin-bottom: 1rem;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
		border-radius: 10px;
		cursor: pointer;
		color: var(--text-primary);
		font-size: 0.85rem;
		font-weight: 500;
		transition: background 0.2s;
	}

	.alerts-banner:hover {
		background: rgba(245, 158, 11, 0.15);
	}

	.alert-item.warning-alert {
		color: var(--warning);
	}

	.alert-item.danger-alert {
		color: var(--danger);
	}

	.alert-sep {
		color: var(--text-secondary);
	}

	/* Highlight animation for scrolled-to items */
	.item-row.item-highlight {
		animation: highlight-pulse 1.5s ease-in-out 2;
	}

	@keyframes highlight-pulse {
		0%, 100% { border-color: var(--border); }
		50% { border-color: var(--accent); box-shadow: 0 0 8px rgba(99, 102, 241, 0.3); }
	}

	/* What can I cook section */
	.cook-section {
		margin-bottom: 1rem;
		background: var(--bg-card);
		border-radius: 12px;
		border: 1px solid var(--border);
		overflow: hidden;
	}

	.cook-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 12px 14px;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-primary);
	}

	.cook-title {
		font-size: 0.9rem;
		font-weight: 600;
	}

	.cook-chevron svg {
		width: 16px;
		height: 16px;
		color: var(--text-secondary);
		transition: transform 0.2s;
	}

	.cook-chevron-open svg {
		transform: rotate(180deg);
	}

	.cook-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0 10px 10px;
	}

	.cook-card {
		display: block;
		padding: 10px 12px;
		background: var(--bg-elevated);
		border-radius: 8px;
		border: 1px solid var(--border);
		text-decoration: none;
		color: var(--text-primary);
		transition: border-color 0.2s;
	}

	.cook-card:hover {
		border-color: var(--accent);
	}

	.cook-card-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}

	.cook-recipe-name {
		font-size: 0.85rem;
		font-weight: 500;
	}

	.cook-match {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 4px;
		background: rgba(34, 197, 94, 0.12);
		color: var(--success);
		white-space: nowrap;
	}

	.cook-missing {
		font-size: 0.75rem;
		color: var(--text-secondary);
		margin-top: 4px;
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
