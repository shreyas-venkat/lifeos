<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { base } from '$app/paths';

	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Home' },
		{ href: '/health', label: 'Health' },
		{ href: '/meals', label: 'Meals' },
		{ href: '/spending', label: 'Spend' },
		{ href: '/usage', label: 'Usage' },
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') return path === `${base}/` || path === base;
		return path.startsWith(`${base}${href}`);
	}
</script>

<div class="app">
	<main>
		{@render children()}
	</main>

	<nav class="bottom-nav">
		{#each tabs as tab}
			<a href="{base}{tab.href}" class:active={isActive(tab.href)}>
				{tab.label}
			</a>
		{/each}
	</nav>
</div>

<style>
	.app { display: flex; flex-direction: column; min-height: 100dvh; }
	main { flex: 1; padding: 1rem; padding-bottom: 5rem; max-width: 600px; width: 100%; margin: 0 auto; }
	.bottom-nav {
		position: fixed; bottom: 0; left: 0; right: 0;
		display: flex; justify-content: space-around; align-items: center;
		height: 52px; background: rgba(15, 15, 20, 0.9);
		backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
		border-top: 1px solid var(--border); z-index: 100;
		padding-bottom: env(safe-area-inset-bottom, 0);
	}
	.bottom-nav a {
		color: var(--text-secondary); text-decoration: none;
		font-size: 0.8rem; font-weight: 500; padding: 8px 12px;
	}
	.bottom-nav a.active { color: var(--accent); }
</style>
