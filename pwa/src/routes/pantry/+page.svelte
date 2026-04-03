<script lang="ts">
	import { query } from '$lib/db';

	let items = $state<any[]>([]);
	let error = $state('');
	let name = $state('');
	let qty = $state('');
	let unit = $state('');
	let category = $state('');
	let expiry = $state('');

	async function load() {
		try {
			items = await query(
				`SELECT id, item, quantity, unit, category, expiry_date, updated_at
				 FROM lifeos.pantry
				 ORDER BY COALESCE(category, 'zzz'), item`
			);
		} catch (e: any) { error = e.message; }
	}

	async function add() {
		if (!name.trim()) return;
		const id = crypto.randomUUID();
		await query(
			`INSERT INTO lifeos.pantry (id, item, quantity, unit, category, expiry_date, updated_at)
			 VALUES ('${id}', '${name.trim()}', ${qty ? Number(qty) : 'NULL'}, ${unit ? `'${unit}'` : 'NULL'},
			 ${category ? `'${category}'` : 'NULL'}, ${expiry ? `'${expiry}'` : 'NULL'}, NOW())`
		);
		name = ''; qty = ''; unit = ''; category = ''; expiry = '';
		await load();
	}

	async function remove(id: string) {
		await query(`DELETE FROM lifeos.pantry WHERE id = '${id}'`);
		await load();
	}

	function isExpiring(d: string | null): boolean {
		if (!d) return false;
		const diff = new Date(d).getTime() - Date.now();
		return diff > 0 && diff < 3 * 86400000;
	}

	function isExpired(d: string | null): boolean {
		if (!d) return false;
		return new Date(d).getTime() < Date.now();
	}

	$effect(() => { load(); });
</script>

<h1>Pantry</h1>

{#if error}
	<p class="error">{error}</p>
{/if}

<form class="add-form" onsubmit={(e) => { e.preventDefault(); add(); }}>
	<input bind:value={name} placeholder="Item name" required />
	<div class="row">
		<input bind:value={qty} placeholder="Qty" type="number" step="any" class="sm" />
		<input bind:value={unit} placeholder="Unit" class="sm" />
		<input bind:value={category} placeholder="Category" class="sm" />
	</div>
	<div class="row">
		<input bind:value={expiry} type="date" class="sm" />
		<button type="submit">Add</button>
	</div>
</form>

{#if items.length === 0}
	<p class="muted">Pantry is empty.</p>
{:else}
	<ul class="pantry-list">
		{#each items as item}
			<li class:expiring={isExpiring(item.expiry_date)} class:expired={isExpired(item.expiry_date)}>
				<div class="item-info">
					<span class="item-name">{item.item}</span>
					<span class="item-detail">
						{#if item.quantity}{item.quantity}{item.unit ? ` ${item.unit}` : ''}{/if}
						{#if item.category}<span class="cat">{item.category}</span>{/if}
						{#if item.expiry_date}<span class="exp">exp {item.expiry_date}</span>{/if}
					</span>
				</div>
				<button class="rm" onclick={() => remove(item.id)}>×</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 { font-size: 1.4rem; margin-bottom: 1rem; }
	.error { color: var(--danger); }
	.muted { color: var(--text-secondary); }
	.add-form { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
	.add-form input { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.75rem; color: inherit; font-size: 0.9rem; }
	.row { display: flex; gap: 0.5rem; }
	.sm { flex: 1; min-width: 0; }
	button[type="submit"] { background: var(--accent); color: #fff; border: none; border-radius: 6px; padding: 0.5rem 1rem; font-weight: 600; cursor: pointer; }
	.pantry-list { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
	.pantry-list li {
		display: flex; justify-content: space-between; align-items: center;
		background: var(--bg-card); border-radius: 8px; padding: 0.6rem 0.75rem;
	}
	.pantry-list li.expiring { border-left: 3px solid orange; }
	.pantry-list li.expired { border-left: 3px solid var(--danger); opacity: 0.7; }
	.item-info { display: flex; flex-direction: column; gap: 0.15rem; }
	.item-name { font-weight: 500; }
	.item-detail { font-size: 0.75rem; color: var(--text-secondary); display: flex; gap: 0.5rem; }
	.cat { background: var(--border); border-radius: 4px; padding: 0 4px; }
	.exp { font-style: italic; }
	.rm { background: none; border: none; color: var(--text-secondary); font-size: 1.2rem; cursor: pointer; padding: 0 0.5rem; }
</style>
