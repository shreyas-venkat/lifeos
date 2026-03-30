<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { Bill } from '$lib/api';

	let bills = $state<Bill[]>([]);
	let loading = $state(true);

	const sorted = $derived(
		[...bills].sort((a, b) => {
			if (!a.due_date) return 1;
			if (!b.due_date) return -1;
			return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
		}),
	);

	function formatAmount(amount: number | null): string {
		if (amount === null || amount === undefined) return '--';
		return `$${amount.toFixed(2)}`;
	}

	function formatDueDate(dateStr: string | null): string {
		if (!dateStr) return 'No date';
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function isDueSoon(dateStr: string | null): boolean {
		if (!dateStr) return false;
		const d = new Date(dateStr);
		const now = new Date();
		const diffMs = d.getTime() - now.getTime();
		const diffDays = diffMs / (1000 * 60 * 60 * 24);
		return diffDays >= 0 && diffDays <= 3;
	}

	function isOverdue(dateStr: string | null): boolean {
		if (!dateStr) return false;
		return new Date(dateStr).getTime() < Date.now();
	}

	function isPaid(status: string): boolean {
		return status.toLowerCase() === 'paid';
	}

	onMount(async () => {
		bills = await api.bills.list();
		loading = false;
	});
</script>

<svelte:head>
	<title>Bills - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Bills</h1>

	{#if loading}
		{#each Array(4) as _}
			<div class="skeleton-item">
				<div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
					<div class="skeleton" style="height: 14px; width: 55%; border-radius: 4px;"></div>
					<div class="skeleton" style="height: 10px; width: 35%; border-radius: 4px;"></div>
				</div>
				<div class="skeleton" style="width: 60px; height: 20px; border-radius: 4px;"></div>
			</div>
		{/each}
	{:else if sorted.length === 0}
		<div class="empty-state fade-in">
			<p>No bills tracked.</p>
			<p class="empty-hint">LifeOS auto-detects bills from your bank emails.</p>
		</div>
	{:else}
		<div class="bill-list fade-in">
			{#each sorted as bill (bill.id)}
				<div
					class="bill-card"
					class:due-soon={!isPaid(bill.status) && isDueSoon(bill.due_date)}
					class:overdue={!isPaid(bill.status) && isOverdue(bill.due_date)}
					class:paid={isPaid(bill.status)}
				>
					<div class="bill-info">
						<div class="bill-header">
							<span class="bill-name">{bill.name}</span>
							{#if isPaid(bill.status)}
								<span class="paid-badge">Paid</span>
							{/if}
						</div>
						<div class="bill-meta">
							{#if bill.merchant}
								<span class="bill-merchant">{bill.merchant}</span>
							{/if}
							<span class="bill-due" class:due-soon-text={!isPaid(bill.status) && isDueSoon(bill.due_date)} class:overdue-text={!isPaid(bill.status) && isOverdue(bill.due_date)}>
								{formatDueDate(bill.due_date)}
							</span>
							{#if bill.recurring}
								<span class="recurring-tag">{bill.recurring}</span>
							{/if}
						</div>
					</div>
					<div class="bill-amount" class:amount-paid={isPaid(bill.status)}>
						{formatAmount(bill.amount)}
					</div>
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

	.bill-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.bill-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		transition: border-color 0.2s;
	}

	.bill-card.due-soon {
		border-color: var(--danger);
		background: rgba(239, 68, 68, 0.05);
	}

	.bill-card.overdue {
		border-color: var(--danger);
		background: rgba(239, 68, 68, 0.08);
	}

	.bill-card.paid {
		opacity: 0.65;
	}

	.bill-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}

	.bill-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.bill-name {
		font-size: 0.95rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.paid-badge {
		background: var(--success);
		color: white;
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.bill-meta {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 0.78rem;
		color: var(--text-secondary);
		flex-wrap: wrap;
	}

	.bill-merchant {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bill-due.due-soon-text {
		color: var(--danger);
		font-weight: 600;
	}

	.bill-due.overdue-text {
		color: var(--danger);
		font-weight: 600;
	}

	.recurring-tag {
		background: var(--accent-glow);
		color: var(--accent);
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.68rem;
		font-weight: 500;
	}

	.bill-amount {
		font-size: 1.1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
		flex-shrink: 0;
		margin-left: 12px;
	}

	.bill-amount.amount-paid {
		color: var(--text-secondary);
		text-decoration: line-through;
	}

	.skeleton-item {
		display: flex;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		margin-bottom: 8px;
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
