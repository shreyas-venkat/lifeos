<script lang="ts">
	import { query } from '$lib/db';

	let transactions = $state<any[]>([]);
	let error = $state('');
	let saving = $state(false);

	let amount = $state<number | ''>('');
	let merchant = $state('');
	let category = $state('groceries');

	async function load() {
		try {
			transactions = await query(
				`SELECT amount, merchant, category, transaction_date
				 FROM lifeos.transactions
				 ORDER BY transaction_date DESC, created_at DESC
				 LIMIT 10`
			);
		} catch (e: any) {
			error = e.message;
		}
	}

	async function submit() {
		if (!amount || !merchant) return;
		saving = true;
		try {
			await query(
				`INSERT INTO lifeos.transactions (id, amount, merchant, category, transaction_date, source, created_at)
				 VALUES (?, ?, ?, ?, (NOW() AT TIME ZONE 'America/Edmonton')::DATE, 'manual', NOW())`,
				crypto.randomUUID(), Number(amount), merchant, category
			);
			amount = '';
			merchant = '';
			category = 'groceries';
			await load();
		} catch (e: any) {
			error = e.message;
		} finally {
			saving = false;
		}
	}

	$effect(() => { load(); });
</script>

<h1>Spending</h1>

{#if error}
	<p class="error">{error}</p>
{/if}

<section>
	<h2>Recent transactions</h2>
	{#if transactions.length === 0}
		<p class="muted">No transactions found.</p>
	{:else}
		<ul class="txn-list">
			{#each transactions as t}
				<li>
					<div class="txn-top">
						<span class="txn-merchant">{t.merchant}</span>
						<span class="txn-amount">${Number(t.amount).toFixed(2)}</span>
					</div>
					<div class="txn-meta">{t.category} &middot; {t.transaction_date}</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section>
	<h2>Log transaction</h2>
	<form onsubmit={(e) => { e.preventDefault(); submit(); }}>
		<input type="number" step="0.01" bind:value={amount} placeholder="Amount" required />
		<input type="text" bind:value={merchant} placeholder="Merchant" required />
		<select bind:value={category}>
			<option value="groceries">Groceries</option>
			<option value="dining">Dining</option>
			<option value="transport">Transport</option>
			<option value="entertainment">Entertainment</option>
			<option value="bills">Bills</option>
			<option value="other">Other</option>
		</select>
		<button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Log transaction'}</button>
	</form>
</section>

<style>
	h1 { font-size: 1.4rem; margin-bottom: 1rem; }
	h2 { font-size: 1rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
	section { margin-bottom: 1.5rem; }
	.error { color: var(--danger); margin-bottom: 0.5rem; }
	.muted { color: var(--text-secondary); }
	.txn-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.txn-list li { background: var(--bg-card); border-radius: 8px; padding: 0.75rem 1rem; }
	.txn-top { display: flex; justify-content: space-between; }
	.txn-merchant { font-weight: 500; }
	.txn-amount { font-weight: 600; font-variant-numeric: tabular-nums; }
	.txn-meta { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem; text-transform: capitalize; }
	form { display: flex; flex-direction: column; gap: 0.5rem; }
	input, select {
		background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
		padding: 0.6rem 0.75rem; color: var(--text-primary); font-size: 0.9rem;
	}
	button {
		background: var(--accent); color: #fff; border: none; border-radius: 8px;
		padding: 0.6rem; font-weight: 600; font-size: 0.9rem;
	}
	button:disabled { opacity: 0.5; }
</style>
