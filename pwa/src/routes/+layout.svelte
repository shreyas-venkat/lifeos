<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { base } from '$app/paths';

	let { children } = $props();
</script>

<div class="app">
	<main>
		{@render children()}
	</main>

	<nav class="bottom-nav">
		<a href="{base}/" class:active={page.url.pathname === `${base}/` || page.url.pathname === base}>
			<span class="icon">&#x1F3E0;</span>
			<span>Home</span>
		</a>
		<a href="{base}/health" class:active={page.url.pathname.startsWith(`${base}/health`)}>
			<span class="icon">&#x2764;</span>
			<span>Health</span>
		</a>
		<a href="{base}/meals" class:active={page.url.pathname.startsWith(`${base}/meals`)}>
			<span class="icon">&#x1F372;</span>
			<span>Meals</span>
		</a>
		<a href="{base}/pantry" class:active={page.url.pathname.startsWith(`${base}/pantry`)}>
			<span class="icon">&#x1F6D2;</span>
			<span>Pantry</span>
		</a>
		<a href="{base}/supplements" class:active={page.url.pathname.startsWith(`${base}/supplements`)}>
			<span class="icon">&#x1F48A;</span>
			<span>Supps</span>
		</a>
	</nav>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}
	main {
		flex: 1;
		padding: 1rem;
		padding-bottom: 4.5rem;
	}
	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: space-around;
		background: var(--bg-secondary);
		padding: 0.5rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		z-index: 100;
	}
	.bottom-nav a {
		display: flex;
		flex-direction: column;
		align-items: center;
		color: var(--text-secondary);
		font-size: 0.75rem;
		gap: 0.25rem;
		transition: color 0.2s;
	}
	.bottom-nav a.active,
	.bottom-nav a:hover {
		color: var(--text-primary);
	}
	.icon {
		font-size: 1.25rem;
	}
</style>
