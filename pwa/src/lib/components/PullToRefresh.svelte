<script lang="ts">
	interface Props {
		onRefresh: () => Promise<void>;
		children: import('svelte').Snippet;
	}

	let { onRefresh, children }: Props = $props();

	let pulling = $state(false);
	let pullDistance = $state(0);
	let refreshing = $state(false);
	let startY = 0;
	const threshold = 60;

	function handleTouchStart(e: TouchEvent) {
		if (window.scrollY === 0) {
			startY = e.touches[0].clientY;
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (!startY) return;
		const distance = e.touches[0].clientY - startY;
		pullDistance = Math.max(0, Math.min(distance, 120));
		pulling = pullDistance > threshold;
	}

	async function handleTouchEnd() {
		if (pulling && !refreshing) {
			refreshing = true;
			try {
				await onRefresh();
			} finally {
				refreshing = false;
			}
		}
		pulling = false;
		pullDistance = 0;
		startY = 0;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="ptr-wrapper"
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
>
	<div
		class="pull-indicator"
		style="
			opacity: {pullDistance > 10 ? Math.min(pullDistance / threshold, 1) : 0};
			transform: translateY({Math.min(pullDistance * 0.4, 40)}px) rotate({pullDistance * 3}deg);
		"
	>
		{#if refreshing}
			<svg class="ptr-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
				<path d="M21 12a9 9 0 11-6.219-8.56" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="7 13 12 18 17 13" />
				<line x1="12" y1="18" x2="12" y2="6" />
			</svg>
		{/if}
	</div>

	{@render children()}
</div>

<style>
	.ptr-wrapper {
		position: relative;
		min-height: 100%;
	}

	.pull-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 0;
		overflow: visible;
		pointer-events: none;
		position: absolute;
		top: -8px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
	}

	.pull-indicator svg {
		width: 24px;
		height: 24px;
		color: var(--accent);
	}

	.ptr-spinner {
		animation: ptr-spin 0.8s linear infinite;
	}

	@keyframes ptr-spin {
		to { transform: rotate(360deg); }
	}
</style>
