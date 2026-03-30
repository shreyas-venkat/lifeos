<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { Transaction, CategorySummary, MonthlyTotal, BudgetInfo } from '$lib/api';

	let loading = $state(true);

	// Data state
	let categorySummary = $state<CategorySummary[]>([]);
	let monthlyHistory = $state<MonthlyTotal[]>([]);
	let recentTransactions = $state<Transaction[]>([]);
	let budgetInfo = $state<BudgetInfo | null>(null);

	// Add form state
	let showAddForm = $state(false);
	let addForm = $state({
		amount: '' as string,
		merchant: '',
		category: 'other' as string,
		description: '',
		date: new Date().toISOString().split('T')[0],
	});
	let addSubmitting = $state(false);

	// Swipe state for transaction deletion
	let swipingId = $state<string | null>(null);

	// Category config
	const CATEGORY_CONFIG: Record<string, { emoji: string; color: string }> = {
		groceries: { emoji: '\u{1F6D2}', color: '#22c55e' },
		dining: { emoji: '\u{1F355}', color: '#f59e0b' },
		transport: { emoji: '\u{1F697}', color: '#3b82f6' },
		entertainment: { emoji: '\u{1F3AC}', color: '#a855f7' },
		bills: { emoji: '\u{1F4CB}', color: '#ef4444' },
		health: { emoji: '\u{1FA7A}', color: '#ec4899' },
		shopping: { emoji: '\u{1F6CD}\uFE0F', color: '#f97316' },
		other: { emoji: '\u{1F4B3}', color: '#6b7280' },
	};

	const CATEGORY_OPTIONS = [
		'groceries',
		'dining',
		'transport',
		'entertainment',
		'bills',
		'health',
		'shopping',
		'other',
	];

	// Derived values
	const totalSpent = $derived(
		categorySummary.reduce((sum, c) => sum + c.total, 0),
	);

	const maxCategoryTotal = $derived(
		categorySummary.length > 0
			? Math.max(...categorySummary.map((c) => c.total))
			: 0,
	);

	const maxMonthlyTotal = $derived(
		monthlyHistory.length > 0
			? Math.max(...monthlyHistory.map((m) => m.total))
			: 0,
	);

	// Budget ring
	const budgetPercent = $derived(budgetInfo ? budgetInfo.percent_used : 0);
	const budgetColor = $derived(
		budgetPercent > 90
			? 'var(--danger, #ef4444)'
			: budgetPercent > 70
				? 'var(--warning, #f59e0b)'
				: 'var(--success, #22c55e)',
	);
	const ringSize = 140;
	const strokeWidth = 10;
	const ringRadius = (ringSize - strokeWidth) / 2;
	const ringCircumference = 2 * Math.PI * ringRadius;
	const ringOffset = $derived(
		ringCircumference * (1 - Math.min(budgetPercent, 100) / 100),
	);
	let ringAnimated = $state(false);
	const animatedOffset = $derived(
		ringAnimated ? ringOffset : ringCircumference,
	);

	const hasData = $derived(
		categorySummary.length > 0 ||
			recentTransactions.length > 0 ||
			monthlyHistory.length > 0,
	);

	function getCategoryConfig(cat: string | null) {
		return CATEGORY_CONFIG[cat || 'other'] || CATEGORY_CONFIG.other;
	}

	function formatCurrency(amount: number): string {
		return `$${amount.toFixed(2)}`;
	}

	function formatMonth(dateStr: string): string {
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short' });
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	async function fetchData() {
		const [summary, history, recent, budget] = await Promise.allSettled([
			api.spending.summary(),
			api.spending.history(),
			api.spending.recent(),
			api.spending.budget(),
		]);
		if (summary.status === 'fulfilled') categorySummary = summary.value;
		if (history.status === 'fulfilled') monthlyHistory = history.value;
		if (recent.status === 'fulfilled') recentTransactions = recent.value;
		if (budget.status === 'fulfilled') budgetInfo = budget.value;
	}

	onMount(async () => {
		await fetchData();
		loading = false;
		requestAnimationFrame(() => {
			ringAnimated = true;
		});
	});

	async function submitAdd() {
		if (addSubmitting || !addForm.merchant.trim()) return;
		const amount = parseFloat(addForm.amount);
		if (isNaN(amount) || amount <= 0) return;
		addSubmitting = true;
		try {
			await api.spending.log({
				amount,
				merchant: addForm.merchant.trim(),
				category: addForm.category,
				description: addForm.description.trim() || undefined,
				date: addForm.date || undefined,
			});
			await fetchData();
			showAddForm = false;
			addForm = {
				amount: '',
				merchant: '',
				category: 'other',
				description: '',
				date: new Date().toISOString().split('T')[0],
			};
		} catch {
			// Submit failed
		} finally {
			addSubmitting = false;
		}
	}

	async function deleteTransaction(id: string) {
		try {
			await api.spending.remove(id);
			recentTransactions = recentTransactions.filter((t) => t.id !== id);
			// Refresh summary after deletion
			const summary = await api.spending.summary();
			categorySummary = summary;
		} catch {
			// Delete failed
		}
		swipingId = null;
	}

	function toggleSwipe(id: string) {
		swipingId = swipingId === id ? null : id;
	}
</script>

<svelte:head>
	<title>Spending - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Spending</h1>

	{#if loading}
		<div class="ring-placeholder">
			<div class="skeleton" style="width: 140px; height: 140px; border-radius: 50%;"></div>
		</div>
		<div class="skeleton" style="height: 16px; width: 100px; border-radius: 4px; margin-bottom: 0.75rem;"></div>
		{#each Array(3) as _}
			<div class="skeleton-item">
				<div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
					<div class="skeleton" style="height: 14px; width: 55%; border-radius: 4px;"></div>
					<div class="skeleton" style="height: 10px; width: 35%; border-radius: 4px;"></div>
				</div>
				<div class="skeleton" style="width: 60px; height: 14px; border-radius: 4px;"></div>
			</div>
		{/each}
	{:else if !hasData}
		<div class="empty-state fade-in">
			<div class="empty-icon">{'\u{1F4B0}'}</div>
			<p>No transactions tracked yet.</p>
			<p class="empty-hint">LifeOS auto-detects spending from bank emails, or tap + to log manually.</p>
		</div>
	{:else}
		<!-- Monthly Overview Card -->
		{#if budgetInfo}
			<div class="budget-card fade-in">
				<div class="ring-container">
					<svg
						width={ringSize}
						height={ringSize}
						viewBox="0 0 {ringSize} {ringSize}"
					>
						<circle
							cx={ringSize / 2}
							cy={ringSize / 2}
							r={ringRadius}
							fill="none"
							stroke="var(--bg-elevated)"
							stroke-width={strokeWidth}
						/>
						<circle
							cx={ringSize / 2}
							cy={ringSize / 2}
							r={ringRadius}
							fill="none"
							stroke={budgetColor}
							stroke-width={strokeWidth}
							stroke-linecap="round"
							stroke-dasharray={ringCircumference}
							stroke-dashoffset={animatedOffset}
							transform="rotate(-90 {ringSize / 2} {ringSize / 2})"
							style="transition: stroke-dashoffset 0.8s ease, stroke 0.3s ease;"
						/>
					</svg>
					<div class="ring-label">
						<span class="ring-count">{budgetPercent}%</span>
						<span class="ring-text">of budget</span>
					</div>
				</div>
				<div class="budget-details">
					<div class="budget-row">
						<span class="budget-label">Spent</span>
						<span class="budget-value">{formatCurrency(budgetInfo.spent)}</span>
					</div>
					<div class="budget-row">
						<span class="budget-label">Budget</span>
						<span class="budget-value">{formatCurrency(budgetInfo.budget)}</span>
					</div>
					<div class="budget-row remaining">
						<span class="budget-label">Remaining</span>
						<span class="budget-value" style="color: {budgetColor}">{formatCurrency(budgetInfo.remaining)}</span>
					</div>
				</div>
			</div>
		{:else}
			<div class="total-card fade-in">
				<span class="total-label">This month</span>
				<span class="total-amount">{formatCurrency(totalSpent)}</span>
			</div>
		{/if}

		<!-- Category Breakdown -->
		{#if categorySummary.length > 0}
			<div class="section-header fade-in">
				<span class="section-label">By Category</span>
				<div class="section-divider"></div>
			</div>
			<div class="category-list fade-in">
				{#each categorySummary as cat}
					{@const config = getCategoryConfig(cat.category)}
					<div class="category-item">
						<div class="category-left">
							<span class="category-emoji">{config.emoji}</span>
							<div class="category-info">
								<span class="category-name">{cat.category}</span>
								<span class="category-count">{cat.count} transaction{cat.count !== 1 ? 's' : ''}</span>
							</div>
						</div>
						<div class="category-right">
							<span class="category-amount">{formatCurrency(cat.total)}</span>
							<div class="category-bar-track">
								<div
									class="category-bar-fill"
									style="width: {maxCategoryTotal > 0 ? (cat.total / maxCategoryTotal) * 100 : 0}%; background: {config.color};"
								></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Monthly Trend -->
		{#if monthlyHistory.length > 0}
			<div class="section-header fade-in">
				<span class="section-label">Monthly Trend</span>
				<div class="section-divider"></div>
			</div>
			<div class="chart-container fade-in">
				<div class="bar-chart">
					{#each monthlyHistory as m}
						<div class="bar-col">
							<div class="bar-value">{formatCurrency(m.total)}</div>
							<div class="bar-track">
								<div
									class="bar-fill"
									style="height: {maxMonthlyTotal > 0 ? (m.total / maxMonthlyTotal) * 100 : 0}%;"
								></div>
							</div>
							<div class="bar-label">{formatMonth(m.month)}</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Recent Transactions -->
		{#if recentTransactions.length > 0}
			<div class="section-header fade-in">
				<span class="section-label">Recent</span>
				<div class="section-divider"></div>
			</div>
			<div class="tx-list fade-in">
				{#each recentTransactions as tx}
					{@const config = getCategoryConfig(tx.category)}
					<div class="tx-item" class:swiped={swipingId === tx.id}>
						<button class="tx-main" onclick={() => toggleSwipe(tx.id)}>
							<span class="tx-emoji">{config.emoji}</span>
							<div class="tx-info">
								<span class="tx-merchant">{tx.merchant || 'Unknown'}</span>
								<span class="tx-meta">
									<span class="tx-category-tag" style="background: {config.color}20; color: {config.color};">{tx.category}</span>
									<span class="tx-date">{formatDate(tx.transaction_date)}</span>
								</span>
							</div>
							<span class="tx-amount">-{formatCurrency(tx.amount)}</span>
						</button>
						{#if swipingId === tx.id}
							<button class="tx-delete" onclick={() => deleteTransaction(tx.id)} aria-label="Delete transaction">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
								</svg>
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	<!-- Add Form Overlay -->
	{#if showAddForm}
		<div class="form-overlay fade-in" role="dialog">
			<div class="form-card">
				<div class="form-header">
					<h3>Log Transaction</h3>
					<button class="form-close" onclick={() => (showAddForm = false)} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<form onsubmit={(e) => { e.preventDefault(); submitAdd(); }}>
					<label class="form-field">
						<span>Amount</span>
						<div class="amount-input-wrap">
							<span class="amount-prefix">$</span>
							<input type="number" bind:value={addForm.amount} placeholder="0.00" min="0.01" step="0.01" required />
						</div>
					</label>
					<label class="form-field">
						<span>Merchant</span>
						<input type="text" bind:value={addForm.merchant} placeholder="e.g. Safeway" required />
					</label>
					<label class="form-field">
						<span>Category</span>
						<select bind:value={addForm.category}>
							{#each CATEGORY_OPTIONS as cat}
								{@const cfg = CATEGORY_CONFIG[cat]}
								<option value={cat}>{cfg.emoji} {cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
							{/each}
						</select>
					</label>
					<label class="form-field">
						<span>Date</span>
						<input type="date" bind:value={addForm.date} />
					</label>
					<label class="form-field">
						<span>Notes</span>
						<input type="text" bind:value={addForm.description} placeholder="Optional" />
					</label>
					<button type="submit" class="form-submit" disabled={addSubmitting}>
						{addSubmitting ? 'Logging...' : 'Log Transaction'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- FAB "+" -->
	<button class="fab" onclick={() => (showAddForm = true)} aria-label="Log transaction">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	</button>
</div>

<style>
	h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 1.25rem; }
	.budget-card { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-bottom: 1.5rem; }
	.ring-container { position: relative; display: flex; align-items: center; justify-content: center; }
	.ring-placeholder { display: flex; justify-content: center; margin-bottom: 1.5rem; }
	.ring-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; }
	.ring-count { font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; }
	.ring-text { font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; }
	.budget-details { width: 100%; display: flex; flex-direction: column; gap: 6px; }
	.budget-row { display: flex; justify-content: space-between; padding: 0 4px; }
	.budget-row.remaining { border-top: 1px solid var(--border); padding-top: 6px; margin-top: 2px; }
	.budget-label { font-size: 0.85rem; color: var(--text-secondary); }
	.budget-value { font-size: 0.85rem; font-weight: 600; font-variant-numeric: tabular-nums; }
	.total-card { display: flex; flex-direction: column; align-items: center; margin-bottom: 1.5rem; padding: 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; }
	.total-label { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
	.total-amount { font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
	.section-header { display: flex; align-items: center; gap: 10px; margin-top: 1.25rem; margin-bottom: 0.5rem; }
	.section-label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
	.section-divider { flex: 1; height: 1px; background: var(--border); }
	.category-list { display: flex; flex-direction: column; gap: 10px; }
	.category-item { display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); border-radius: 12px; padding: 12px 14px; border: 1px solid var(--border); }
	.category-left { display: flex; align-items: center; gap: 10px; }
	.category-emoji { font-size: 1.3rem; }
	.category-info { display: flex; flex-direction: column; gap: 1px; }
	.category-name { font-size: 0.9rem; font-weight: 600; text-transform: capitalize; }
	.category-count { font-size: 0.72rem; color: var(--text-secondary); }
	.category-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; min-width: 100px; }
	.category-amount { font-size: 0.9rem; font-weight: 600; font-variant-numeric: tabular-nums; }
	.category-bar-track { width: 100%; height: 4px; background: var(--bg-elevated); border-radius: 2px; overflow: hidden; }
	.category-bar-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease; }
	.chart-container { padding: 16px 0; }
	.bar-chart { display: flex; align-items: flex-end; gap: 8px; height: 160px; }
	.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
	.bar-value { font-size: 0.65rem; color: var(--text-secondary); font-variant-numeric: tabular-nums; margin-bottom: 4px; white-space: nowrap; }
	.bar-track { flex: 1; width: 100%; max-width: 36px; display: flex; flex-direction: column; justify-content: flex-end; background: var(--bg-elevated); border-radius: 6px 6px 0 0; overflow: hidden; }
	.bar-fill { width: 100%; background: var(--accent); border-radius: 6px 6px 0 0; transition: height 0.6s ease; min-height: 2px; }
	.bar-label { font-size: 0.7rem; color: var(--text-secondary); margin-top: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
	.tx-list { display: flex; flex-direction: column; gap: 6px; }
	.tx-item { display: flex; position: relative; overflow: hidden; border-radius: 12px; }
	.tx-main { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; cursor: pointer; text-align: left; color: inherit; font-family: inherit; transition: transform 0.2s ease; }
	.tx-item.swiped .tx-main { transform: translateX(-56px); }
	.tx-emoji { font-size: 1.1rem; flex-shrink: 0; }
	.tx-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
	.tx-merchant { font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.tx-meta { display: flex; align-items: center; gap: 8px; }
	.tx-category-tag { font-size: 0.68rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; text-transform: capitalize; }
	.tx-date { font-size: 0.72rem; color: var(--text-secondary); }
	.tx-amount { font-size: 0.9rem; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--danger, #ef4444); flex-shrink: 0; }
	.tx-delete { position: absolute; right: 0; top: 0; bottom: 0; width: 56px; background: var(--danger, #ef4444); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 0 12px 12px 0; }
	.tx-delete svg { width: 18px; height: 18px; color: white; }
	.empty-state { text-align: center; padding: 3rem 1rem; color: var(--text-secondary); }
	.empty-icon { font-size: 3rem; margin-bottom: 0.75rem; }
	.empty-hint { font-size: 0.85rem; margin-top: 0.5rem; opacity: 0.7; max-width: 280px; margin-left: auto; margin-right: auto; }
	.skeleton-item { display: flex; align-items: center; background: var(--bg-card); border-radius: 12px; padding: 14px; border: 1px solid var(--border); margin-bottom: 8px; }
	.form-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: flex-end; justify-content: center; z-index: 100; padding: 0 0 env(safe-area-inset-bottom, 0); }
	.form-card { background: var(--bg-card); border-radius: 16px 16px 0 0; padding: 20px 20px 80px; width: 100%; max-width: 500px; max-height: 80vh; overflow-y: auto; border: 1px solid var(--border); border-bottom: none; }
	.form-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
	.form-header h3 { font-size: 1.1rem; font-weight: 600; }
	.form-close { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-elevated); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-secondary); }
	.form-close svg { width: 16px; height: 16px; }
	.form-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
	.form-field span { font-size: 0.75rem; color: var(--text-secondary); font-weight: 500; }
	.form-field input, .form-field select { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text-primary); font-size: 0.9rem; }
	.form-field input:focus, .form-field select:focus { outline: none; border-color: var(--accent); }
	.amount-input-wrap { display: flex; align-items: center; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
	.amount-input-wrap:focus-within { border-color: var(--accent); }
	.amount-prefix { padding: 8px 0 8px 12px; color: var(--text-secondary); font-size: 0.9rem; font-weight: 600; }
	.amount-input-wrap input { border: none; background: transparent; padding-left: 4px; }
	.amount-input-wrap input:focus { outline: none; border-color: transparent; }
	.form-submit { width: 100%; background: var(--accent); color: white; border: none; border-radius: 10px; padding: 12px; font-size: 0.9rem; font-weight: 600; cursor: pointer; margin-top: 4px; transition: opacity 0.2s; }
	.form-submit:disabled { opacity: 0.6; cursor: not-allowed; }
	.form-submit:hover:not(:disabled) { opacity: 0.9; }
	.fab { position: fixed; bottom: 72px; right: 20px; width: 52px; height: 52px; background: var(--accent); border-radius: 16px; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3); transition: transform 0.2s; z-index: 50; }
	.fab:hover { transform: scale(1.05); }
	.fab svg { width: 22px; height: 22px; color: white; }
</style>
