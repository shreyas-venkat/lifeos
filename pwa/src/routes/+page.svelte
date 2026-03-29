<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import type { HealthMetric, CalorieEntry, SupplementWithStatus, PantryItem } from '$lib/api';
	import * as d3 from 'd3';

	let svgEl = $state<SVGSVGElement | null>(null);
	let loading = $state(true);

	// Summary data
	let healthMetrics = $state<HealthMetric[]>([]);
	let calorieEntries = $state<CalorieEntry[]>([]);
	let supplements = $state<SupplementWithStatus[]>([]);
	let pantryItems = $state<PantryItem[]>([]);

	interface NodeData {
		id: string;
		label: string;
		stat: string;
		href: string;
		color: string;
		x?: number;
		y?: number;
		fx?: number | null;
		fy?: number | null;
	}

	function getStepCount(metrics: HealthMetric[]): string {
		const steps = metrics.find((m) => m.metric_type === 'steps');
		if (!steps) return 'No data';
		return `${Math.round(steps.value).toLocaleString()} steps`;
	}

	function getCalorieStat(entries: CalorieEntry[]): string {
		if (entries.length === 0) return 'No data';
		const total = entries.reduce((sum, e) => sum + (e.calories ?? 0), 0);
		return `${Math.round(total)} kcal`;
	}

	function getSuppStat(supps: SupplementWithStatus[]): string {
		if (supps.length === 0) return 'No data';
		const taken = supps.filter((s) => s.taken).length;
		return `${taken}/${supps.length} taken`;
	}

	function getPantryStat(items: PantryItem[]): string {
		if (items.length === 0) return 'No data';
		return `${items.length} items`;
	}

	function buildGraph() {
		if (!svgEl) return;

		const container = svgEl.parentElement;
		if (!container) return;
		const width = container.clientWidth;
		const height = container.clientHeight;

		const centerX = width / 2;
		const centerY = height / 2;
		const isMobile = width < 600;
		const radius = isMobile ? Math.min(width, height) * 0.3 : Math.min(width, height) * 0.28;

		const nodes: NodeData[] = [
			{
				id: 'center',
				label: 'LifeOS',
				stat: new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
				href: '',
				color: '#6366f1',
			},
			{
				id: 'health',
				label: 'Health',
				stat: getStepCount(healthMetrics),
				href: `${base}/health`,
				color: '#ef4444',
			},
			{
				id: 'meals',
				label: 'Meals',
				stat: getCalorieStat(calorieEntries),
				href: `${base}/meals`,
				color: '#f59e0b',
			},
			{
				id: 'pantry',
				label: 'Pantry',
				stat: getPantryStat(pantryItems),
				href: `${base}/pantry`,
				color: '#22c55e',
			},
			{
				id: 'supps',
				label: 'Supplements',
				stat: getSuppStat(supplements),
				href: `${base}/supplements`,
				color: '#8b5cf6',
			},
		];

		const links = [
			{ source: 'center', target: 'health' },
			{ source: 'center', target: 'meals' },
			{ source: 'center', target: 'pantry' },
			{ source: 'center', target: 'supps' },
		];

		// Position satellite nodes in a circle
		const angles = [(-Math.PI) / 2, 0, Math.PI / 2, Math.PI];
		const satellites = nodes.filter((n) => n.id !== 'center');
		satellites.forEach((node, i) => {
			node.x = centerX + radius * Math.cos(angles[i]);
			node.y = centerY + radius * Math.sin(angles[i]);
		});
		nodes[0].x = centerX;
		nodes[0].y = centerY;

		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();
		svg.attr('viewBox', `0 0 ${width} ${height}`);

		const defs = svg.append('defs');

		// Glow filter
		const filter = defs.append('filter').attr('id', 'glow');
		filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
		const merge = filter.append('feMerge');
		merge.append('feMergeNode').attr('in', 'blur');
		merge.append('feMergeNode').attr('in', 'SourceGraphic');

		const g = svg.append('g');

		// Draw edges
		g.selectAll('line')
			.data(links)
			.enter()
			.append('line')
			.attr('x1', () => centerX)
			.attr('y1', () => centerY)
			.attr('x2', (_d, i) => satellites[i].x ?? 0)
			.attr('y2', (_d, i) => satellites[i].y ?? 0)
			.attr('stroke', '#2a2a3a')
			.attr('stroke-width', 1.5)
			.attr('stroke-dasharray', '4,4')
			.attr('opacity', 0.6);

		// Node groups
		const nodeSize = isMobile ? 36 : 42;
		const centerSize = isMobile ? 42 : 50;

		const nodeGroups = g
			.selectAll<SVGGElement, NodeData>('g.node')
			.data(nodes)
			.enter()
			.append('g')
			.attr('class', 'node')
			.attr('transform', (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`)
			.style('cursor', (d) => (d.href ? 'pointer' : 'default'));

		// Circle backgrounds
		nodeGroups
			.append('circle')
			.attr('r', (d) => (d.id === 'center' ? centerSize : nodeSize))
			.attr('fill', 'var(--bg-card)')
			.attr('stroke', (d) => d.color)
			.attr('stroke-width', 2)
			.attr('filter', 'url(#glow)');

		// Stat text
		nodeGroups
			.append('text')
			.text((d) => d.stat)
			.attr('text-anchor', 'middle')
			.attr('dy', '-0.2em')
			.attr('fill', 'var(--text-primary)')
			.attr('font-size', isMobile ? '10px' : '11px')
			.attr('font-weight', '600')
			.attr('font-family', 'Inter, sans-serif');

		// Label text
		nodeGroups
			.append('text')
			.text((d) => d.label)
			.attr('text-anchor', 'middle')
			.attr('dy', '1.2em')
			.attr('fill', 'var(--text-secondary)')
			.attr('font-size', isMobile ? '9px' : '10px')
			.attr('font-weight', '400')
			.attr('font-family', 'Inter, sans-serif');

		// Click handler
		nodeGroups.on('click', (_event: MouseEvent, d: NodeData) => {
			if (d.href) goto(d.href);
		});

		// On desktop: gentle floating animation with force simulation
		if (!isMobile) {
			type SimNode = NodeData & d3.SimulationNodeDatum;
			const simNodes = nodes as SimNode[];

			// Pin center node
			simNodes[0].fx = centerX;
			simNodes[0].fy = centerY;

			const simulation = d3
				.forceSimulation<SimNode>(simNodes)
				.force(
					'link',
					d3
						.forceLink(links)
						.id((d) => (d as SimNode).id)
						.distance(radius)
						.strength(0.3)
				)
				.force('charge', d3.forceManyBody().strength(-100))
				.force('center', d3.forceCenter(centerX, centerY).strength(0.05))
				.alphaDecay(0.02)
				.on('tick', () => {
					g.selectAll<SVGLineElement, (typeof links)[0]>('line')
						.attr('x1', centerX)
						.attr('y1', centerY)
						.attr('x2', (_d, i) => simNodes[i + 1]?.x ?? 0)
						.attr('y2', (_d, i) => simNodes[i + 1]?.y ?? 0);

					g.selectAll<SVGGElement, SimNode>('g.node').attr(
						'transform',
						(d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`
					);
				});

			// Drag behavior
			const drag = d3
				.drag<SVGGElement, SimNode>()
				.on('start', (event) => {
					if (!event.active) simulation.alphaTarget(0.3).restart();
					const d = event.subject as SimNode;
					d.fx = d.x;
					d.fy = d.y;
				})
				.on('drag', (event) => {
					const d = event.subject as SimNode;
					d.fx = event.x;
					d.fy = event.y;
				})
				.on('end', (event) => {
					if (!event.active) simulation.alphaTarget(0);
					const d = event.subject as SimNode;
					if (d.id !== 'center') {
						d.fx = null;
						d.fy = null;
					}
				});

			nodeGroups
				.filter((d) => d.id !== 'center')
				.call(drag as unknown as (selection: d3.Selection<SVGGElement, NodeData, SVGGElement, unknown>) => void);
		}
	}

	onMount(async () => {
		const [h, c, s, p] = await Promise.allSettled([
			api.health.today(),
			api.calories.today(),
			api.supplements.today(),
			api.pantry.list(),
		]);
		if (h.status === 'fulfilled') healthMetrics = h.value;
		if (c.status === 'fulfilled') calorieEntries = c.value;
		if (s.status === 'fulfilled') supplements = s.value;
		if (p.status === 'fulfilled') pantryItems = p.value;
		loading = false;

		// Wait for next frame so SVG element is rendered
		requestAnimationFrame(() => buildGraph());
	});
</script>

<svelte:head>
	<title>LifeOS</title>
</svelte:head>

<div class="dashboard">
	{#if loading}
		<div class="loading-container">
			<div class="skeleton" style="width: 200px; height: 200px; border-radius: 50%; margin: auto;"></div>
		</div>
	{:else}
		<div class="graph-container fade-in">
			<svg bind:this={svgEl}></svg>
		</div>
	{/if}
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 5rem);
		height: calc(100dvh - 5rem);
	}

	.graph-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 300px;
	}

	.graph-container svg {
		width: 100%;
		height: 100%;
		max-height: 500px;
	}

	.loading-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
