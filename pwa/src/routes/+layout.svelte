<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { base } from '$app/paths';

	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
		{ href: '/health', label: 'Health', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
		{ href: '/meals', label: 'Meals', icon: 'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-2c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z' },
		{ href: '/pantry', label: 'Pantry', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
		{ href: '/supplements', label: 'Supps', icon: 'M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') {
			return path === `${base}/` || path === base;
		}
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
				<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d={tab.icon} />
				</svg>
				{#if isActive(tab.href)}
					<span class="nav-label">{tab.label}</span>
				{/if}
			</a>
		{/each}
	</nav>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		min-height: 100dvh;
	}

	main {
		flex: 1;
		padding: 1rem;
		padding-bottom: 5rem;
		max-width: 600px;
		width: 100%;
		margin: 0 auto;
	}

	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: space-around;
		align-items: center;
		height: 56px;
		background: rgba(15, 15, 20, 0.85);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-top: 1px solid var(--border);
		z-index: 100;
		padding-bottom: env(safe-area-inset-bottom, 0);
	}

	.bottom-nav a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		color: var(--text-secondary);
		text-decoration: none;
		transition: color 0.2s ease;
		padding: 4px 12px;
		border-radius: 12px;
		min-width: 48px;
	}

	.bottom-nav a.active {
		color: var(--accent);
		background: var(--accent-glow);
	}

	.nav-icon {
		width: 22px;
		height: 22px;
	}

	.nav-label {
		font-size: 0.65rem;
		font-weight: 500;
		letter-spacing: 0.02em;
	}
</style>
