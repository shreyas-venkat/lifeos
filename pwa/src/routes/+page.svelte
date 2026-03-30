<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import type { HealthMetric, CalorieEntry, SupplementWithStatus, PantryItem } from '$lib/api';
	import * as d3 from 'd3';

	let svgEl = $state<SVGSVGElement | null>(null);
	let loading = $state(true);

	// Data state
	let healthMetrics = $state<HealthMetric[]>([]);
	let calorieEntries = $state<CalorieEntry[]>([]);
	let supplements = $state<SupplementWithStatus[]>([]);
	let pantryItems = $state<PantryItem[]>([]);

	// Date picker state
	let selectedDate = $state<Date>(new Date());
	let dateLabel = $derived(formatDateLabel(selectedDate));

	// Track simulation for cleanup
	let simulation: d3.Simulation<SimNode, d3.SimulationLinkDatum<SimNode>> | null = null;
	let jitterInterval: ReturnType<typeof setInterval> | null = null;

	// --- Types ---
	interface NodeData {
		id: string;
		label: string;
		stat: string;
		href: string;
		color: string;
		icon: string;
		hasData: boolean;
		x?: number;
		y?: number;
		fx?: number | null;
		fy?: number | null;
	}

	type SimNode = NodeData & d3.SimulationNodeDatum;

	// --- SVG icon paths ---
	const ICONS: Record<string, string> = {
		health:
			'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
		meals:
			'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
		pantry:
			'M5.5 21h13a1.5 1.5 0 001.46-1.15l1.5-6A1.5 1.5 0 0020 12H4a1.5 1.5 0 00-1.46 1.85l1.5 6A1.5 1.5 0 005.5 21zM6 4h12l2 6H4l2-6zm6-2a1 1 0 00-1 1v1h2V3a1 1 0 00-1-1z',
		supps:
			'M4.22 11.29l5.49-5.49a5 5 0 017.07 0 5 5 0 010 7.07l-5.49 5.49a5 5 0 01-7.07 0 5 5 0 010-7.07zm4.24 1.41L14.8 6.36',
		center:
			'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
	};

	// --- Stat computation ---
	function getStepCount(metrics: HealthMetric[]): { stat: string; hasData: boolean } {
		const steps = metrics.find((m) => m.metric_type === 'steps');
		if (!steps) return { stat: '\u2014', hasData: false };
		return { stat: `${Math.round(steps.value).toLocaleString()} steps`, hasData: true };
	}

	function getCalorieStat(entries: CalorieEntry[]): { stat: string; hasData: boolean } {
		if (entries.length === 0) return { stat: '\u2014', hasData: false };
		const total = entries.reduce((sum, e) => sum + (e.calories ?? 0), 0);
		return { stat: `${Math.round(total)} kcal`, hasData: true };
	}

	function getSuppStat(supps: SupplementWithStatus[]): { stat: string; hasData: boolean } {
		if (supps.length === 0) return { stat: '\u2014', hasData: false };
		const taken = supps.filter((s) => s.taken).length;
		return { stat: `${taken}/${supps.length} taken`, hasData: true };
	}

	function getPantryStat(items: PantryItem[]): { stat: string; hasData: boolean } {
		if (items.length === 0) return { stat: '\u2014', hasData: false };
		return { stat: `${items.length} items`, hasData: true };
	}

	// --- Date helpers ---
	function formatDateLabel(d: Date): string {
		const now = new Date();
		if (
			d.getFullYear() === now.getFullYear() &&
			d.getMonth() === now.getMonth() &&
			d.getDate() === now.getDate()
		) {
			return 'Today';
		}
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function toDateString(d: Date): string {
		return d.toISOString().split('T')[0];
	}

	function isToday(d: Date): boolean {
		const now = new Date();
		return (
			d.getFullYear() === now.getFullYear() &&
			d.getMonth() === now.getMonth() &&
			d.getDate() === now.getDate()
		);
	}

	function shiftDate(days: number) {
		const d = new Date(selectedDate);
		d.setDate(d.getDate() + days);
		if (d > new Date()) return;
		selectedDate = d;
		fetchData();
	}

	// --- Data fetching ---
	async function fetchData() {
		const dateStr = isToday(selectedDate) ? undefined : toDateString(selectedDate);
		const [h, c, s, p] = await Promise.allSettled([
			api.health.today(dateStr),
			api.calories.today(dateStr),
			api.supplements.today(dateStr),
			api.pantry.list(),
		]);
		if (h.status === 'fulfilled') healthMetrics = h.value;
		if (c.status === 'fulfilled') calorieEntries = c.value;
		if (s.status === 'fulfilled') supplements = s.value;
		if (p.status === 'fulfilled') pantryItems = p.value;

		if (!loading) buildGraph();
	}

	// --- Graph rendering ---
	function buildGraph() {
		if (!svgEl) return;
		const container = svgEl.parentElement;
		if (!container) return;

		const width = container.clientWidth;
		const height = container.clientHeight;
		const centerX = width / 2;
		const centerY = height / 2;
		const isMobile = width < 600;

		// Calculate orbit radius to fit all nodes with padding
		// Ensure nodes + labels fit within viewport
		const maxOrbit = Math.min(width, height) / 2 - (isMobile ? 70 : 90);
		const orbitRadius = Math.max(isMobile ? 90 : 120, maxOrbit);

		const centerNodeR = isMobile ? 42 : 50;
		const satNodeR = isMobile ? 34 : 40;

		// Compute stats
		const stepData = getStepCount(healthMetrics);
		const calData = getCalorieStat(calorieEntries);
		const suppData = getSuppStat(supplements);
		const pantryData = getPantryStat(pantryItems);

		// Satellite angles: evenly spaced around circle (top, right, bottom, left)
		const angles = [
			-Math.PI / 2,      // top
			0,                  // right
			Math.PI * 0.6,      // bottom-right
			Math.PI,            // left
		];

		const satellitePositions = angles.map((a) => ({
			x: centerX + Math.cos(a) * orbitRadius,
			y: centerY + Math.sin(a) * orbitRadius,
		}));

		const nodes: SimNode[] = [
			{
				id: 'center',
				label: 'LifeOS',
				stat: '',
				href: '',
				color: '#6366f1',
				icon: ICONS.center,
				hasData: true,
				x: centerX,
				y: centerY,
				index: 0,
			},
			{
				id: 'health',
				label: 'Health',
				stat: stepData.stat,
				href: `${base}/health`,
				color: '#ef4444',
				icon: ICONS.health,
				hasData: stepData.hasData,
				x: satellitePositions[0].x,
				y: satellitePositions[0].y,
				index: 1,
			},
			{
				id: 'meals',
				label: 'Meals',
				stat: calData.stat,
				href: `${base}/meals`,
				color: '#f59e0b',
				icon: ICONS.meals,
				hasData: calData.hasData,
				x: satellitePositions[1].x,
				y: satellitePositions[1].y,
				index: 2,
			},
			{
				id: 'pantry',
				label: 'Pantry',
				stat: pantryData.stat,
				href: `${base}/pantry`,
				color: '#22c55e',
				icon: ICONS.pantry,
				hasData: pantryData.hasData,
				x: satellitePositions[2].x,
				y: satellitePositions[2].y,
				index: 3,
			},
			{
				id: 'supps',
				label: 'Supplements',
				stat: suppData.stat,
				href: `${base}/supplements`,
				color: '#8b5cf6',
				icon: ICONS.supps,
				hasData: suppData.hasData,
				x: satellitePositions[3].x,
				y: satellitePositions[3].y,
				index: 4,
			},
		];

		const links: d3.SimulationLinkDatum<SimNode>[] = [
			{ source: nodes[0], target: nodes[1] },
			{ source: nodes[0], target: nodes[2] },
			{ source: nodes[0], target: nodes[3] },
			{ source: nodes[0], target: nodes[4] },
		];

		// Clear previous
		if (simulation) simulation.stop();
		if (jitterInterval) clearInterval(jitterInterval);

		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();
		svg.attr('viewBox', `0 0 ${width} ${height}`);

		// --- Defs ---
		const defs = svg.append('defs');

		// Glow filter
		const glowFilter = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
		glowFilter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur');
		const glowMerge = glowFilter.append('feMerge');
		glowMerge.append('feMergeNode').attr('in', 'blur');
		glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

		// Stronger glow for hover
		const hoverGlow = defs.append('filter').attr('id', 'glow-hover').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
		hoverGlow.append('feGaussianBlur').attr('stdDeviation', '8').attr('result', 'blur');
		const hoverMerge = hoverGlow.append('feMerge');
		hoverMerge.append('feMergeNode').attr('in', 'blur');
		hoverMerge.append('feMergeNode').attr('in', 'SourceGraphic');

		// Particle glow filter
		const particleGlow = defs.append('filter').attr('id', 'particle-glow').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
		particleGlow.append('feGaussianBlur').attr('stdDeviation', '2').attr('result', 'blur');
		const pMerge = particleGlow.append('feMerge');
		pMerge.append('feMergeNode').attr('in', 'blur');
		pMerge.append('feMergeNode').attr('in', 'SourceGraphic');

		// Radial gradients for each node
		nodes.forEach((n) => {
			const grad = defs
				.append('radialGradient')
				.attr('id', `grad-${n.id}`)
				.attr('cx', '40%')
				.attr('cy', '40%')
				.attr('r', '60%');
			if (n.hasData) {
				grad.append('stop').attr('offset', '0%').attr('stop-color', n.color).attr('stop-opacity', 0.9);
				grad.append('stop').attr('offset', '100%').attr('stop-color', n.color).attr('stop-opacity', 0.3);
			} else {
				grad.append('stop').attr('offset', '0%').attr('stop-color', '#242430').attr('stop-opacity', 0.9);
				grad.append('stop').attr('offset', '100%').attr('stop-color', '#1a1a24').attr('stop-opacity', 0.6);
			}
		});

		// --- Root group for zoom/pan ---
		const rootG = svg.append('g').attr('class', 'root');

		// Zoom behavior
		const zoomBehavior = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.5, 2])
			.on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
				rootG.attr('transform', event.transform.toString());
			});
		svg.call(zoomBehavior);
		svg.on('dblclick.zoom', () => {
			svg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity);
		});

		// --- Edge paths ---
		const edgeG = rootG.append('g').attr('class', 'edges');

		function edgePath(src: SimNode, tgt: SimNode): string {
			const sx = src.x ?? 0;
			const sy = src.y ?? 0;
			const tx = tgt.x ?? 0;
			const ty = tgt.y ?? 0;
			const mx = (sx + tx) / 2;
			const my = (sy + ty) / 2;
			const dx = tx - sx;
			const dy = ty - sy;
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const offsetAmt = len * 0.1;
			const cx = mx + (-dy / len) * offsetAmt;
			const cy = my + (dx / len) * offsetAmt;
			return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
		}

		const edgePaths = edgeG
			.selectAll<SVGPathElement, d3.SimulationLinkDatum<SimNode>>('path.edge')
			.data(links)
			.enter()
			.append('path')
			.attr('class', 'edge')
			.attr('d', (d) => edgePath(d.source as SimNode, d.target as SimNode))
			.attr('fill', 'none')
			.attr('stroke', '#2a2a3a')
			.attr('stroke-width', 1.5)
			.attr('opacity', 0.3)
			.attr('id', (_d, i) => `edge-${i}`);

		// --- Edge particles (animateMotion) ---
		const particlesG = rootG.append('g').attr('class', 'particles');
		links.forEach((_link, i) => {
			const target = _link.target as SimNode;
			const g = particlesG.append('g');
			const circle = g.append('circle')
				.attr('r', 4)
				.attr('fill', target.color)
				.attr('opacity', 0.8)
				.attr('filter', 'url(#particle-glow)');
			circle.append('animateMotion')
				.attr('dur', '3s')
				.attr('repeatCount', 'indefinite')
				.attr('begin', `${i * 0.7}s`)
				.append('mpath')
				.attr('href', `#edge-${i}`);
		});

		// --- Node groups ---
		const nodeG = rootG.append('g').attr('class', 'nodes');

		const nodeGroups = nodeG
			.selectAll<SVGGElement, SimNode>('g.node')
			.data(nodes)
			.enter()
			.append('g')
			.attr('class', 'node')
			.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
			.style('cursor', (d) => (d.href ? 'pointer' : 'default'))
			.style('will-change', 'transform');

		// Inner group for breathing animation
		const innerGroups = nodeGroups
			.append('g')
			.attr('class', (_d, i) => `node-inner breathing-${i}`);

		// Filled circle backgrounds with gradient
		innerGroups
			.append('circle')
			.attr('class', 'node-bg')
			.attr('r', (d) => (d.id === 'center' ? centerNodeR : satNodeR))
			.attr('fill', (d) => `url(#grad-${d.id})`)
			.attr('filter', 'url(#glow)');

		// SVG icons inside nodes
		innerGroups
			.append('path')
			.attr('class', 'node-icon')
			.attr('d', (d) => d.icon)
			.attr('fill', (d) => (d.hasData ? '#fff' : '#ffffff4d'))
			.attr('transform', (d) => {
				const s = d.id === 'center' ? 0.9 : 0.7;
				const offset = d.id === 'center' ? -11 : -8.5;
				return `translate(${offset}, ${offset - 6}) scale(${s})`;
			});

		// Stat text (below icon)
		innerGroups
			.filter((d) => d.id !== 'center')
			.append('text')
			.attr('class', 'node-stat')
			.text((d) => d.stat)
			.attr('text-anchor', 'middle')
			.attr('dy', '1.2em')
			.attr('fill', (d) => (d.hasData ? '#e8e8ed' : '#8888a0'))
			.attr('font-size', isMobile ? '9px' : '10px')
			.attr('font-weight', '600')
			.attr('font-family', 'Inter, sans-serif');

		// "LifeOS" text on center node
		innerGroups
			.filter((d) => d.id === 'center')
			.append('text')
			.text('LifeOS')
			.attr('text-anchor', 'middle')
			.attr('dy', '1.3em')
			.attr('fill', '#e8e8ed')
			.attr('font-size', isMobile ? '11px' : '13px')
			.attr('font-weight', '700')
			.attr('font-family', 'Inter, sans-serif')
			.attr('letter-spacing', '-0.02em');

		// Label text below circle
		nodeGroups
			.filter((d) => d.id !== 'center')
			.append('text')
			.attr('class', 'node-label')
			.text((d) => d.label)
			.attr('text-anchor', 'middle')
			.attr('dy', (d) => {
				const r = d.id === 'center' ? centerNodeR : satNodeR;
				return `${r + 16}px`;
			})
			.attr('fill', '#8888a0')
			.attr('font-size', isMobile ? '10px' : '11px')
			.attr('font-weight', '400')
			.attr('font-family', 'Inter, sans-serif');

		// --- Hover & click ---
		nodeGroups
			.on('mouseenter', function (this: SVGGElement, _event: MouseEvent, d: SimNode) {
				if (isMobile) return; // No hover on mobile
				const inner = d3.select(this).select('.node-inner');
				inner.select('.node-bg').attr('filter', 'url(#glow-hover)');
				inner.transition().duration(150).attr('transform', 'scale(1.15)');
				const idx = d.index;
				if (idx !== undefined && idx > 0) {
					edgePaths.filter((_e, i) => i === idx - 1).transition().duration(150).attr('opacity', 0.8);
				}
			})
			.on('mouseleave', function (this: SVGGElement) {
				if (isMobile) return;
				const inner = d3.select(this).select('.node-inner');
				inner.select('.node-bg').attr('filter', 'url(#glow)');
				inner.transition().duration(150).attr('transform', 'scale(1)');
				edgePaths.transition().duration(150).attr('opacity', 0.3);
			})
			.on('click', (_event: MouseEvent, d: SimNode) => {
				if (d.href) {
					const targetScale = 1.5;
					svg
						.transition()
						.duration(400)
						.call(
							zoomBehavior.transform,
							d3.zoomIdentity.translate(width / 2 - (d.x ?? 0) * targetScale, height / 2 - (d.y ?? 0) * targetScale).scale(targetScale)
						)
						.on('end', () => goto(d.href));
				} else {
					const centerInner = nodeGroups.filter((n) => n.id === 'center').select('.node-inner');
					centerInner
						.transition()
						.duration(150)
						.attr('transform', 'scale(1.2)')
						.transition()
						.duration(300)
						.attr('transform', 'scale(1)');
				}
			});

		// --- Physics: desktop only, fixed positions on mobile ---
		if (isMobile) {
			// Mobile: fixed positions, no physics at all
			// Positions are already set correctly from the initial node data
			// Just set the edge paths once (they won't change)
			edgePaths.attr('d', (d) => edgePath(d.source as SimNode, d.target as SimNode));
		} else {
			// Desktop: gentle physics simulation
			// Pin center node
			nodes[0].fx = centerX;
			nodes[0].fy = centerY;

			simulation = d3
				.forceSimulation<SimNode>(nodes)
				.force(
					'link',
					d3
						.forceLink<SimNode, d3.SimulationLinkDatum<SimNode>>(links)
						.id((d) => d.id)
						.distance(orbitRadius)
						.strength(0.3)
				)
				.force('charge', d3.forceManyBody<SimNode>().strength(-80))
				.force('center', d3.forceCenter(centerX, centerY).strength(0.01))
				.force(
					'collision',
					d3.forceCollide<SimNode>().radius((d) => (d.id === 'center' ? centerNodeR + 10 : satNodeR + 10))
				)
				.alphaTarget(0.02)
				.on('tick', () => {
					// Clamp node positions to viewport bounds
					const pad = 20;
					nodes.forEach((node) => {
						const r = node.id === 'center' ? centerNodeR : satNodeR;
						node.x = Math.max(r + pad, Math.min(width - r - pad, node.x!));
						node.y = Math.max(r + pad, Math.min(height - r - pad, node.y!));
					});
					nodeGroups.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
					edgePaths.attr('d', (d) => edgePath(d.source as SimNode, d.target as SimNode));
				});

			simulation.alphaTarget(0.02).restart();

			// Gentle random jitter
			jitterInterval = setInterval(() => {
				nodes.forEach((n) => {
					if (n.id === 'center') return;
					n.vx = (n.vx ?? 0) + (Math.random() - 0.5) * 2;
					n.vy = (n.vy ?? 0) + (Math.random() - 0.5) * 2;
				});
			}, 3000);

			// Drag behavior (desktop only)
			const drag = d3
				.drag<SVGGElement, SimNode>()
				.on('start', (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>) => {
					if (!event.active && simulation) simulation.alphaTarget(0.1).restart();
					const d = event.subject;
					d.fx = d.x;
					d.fy = d.y;
				})
				.on('drag', (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>) => {
					const d = event.subject;
					const r = d.id === 'center' ? centerNodeR : satNodeR;
					const pad = 20;
					d.fx = Math.max(r + pad, Math.min(width - r - pad, event.x));
					d.fy = Math.max(r + pad, Math.min(height - r - pad, event.y));
				})
				.on('end', (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>) => {
					if (!event.active && simulation) simulation.alphaTarget(0.02);
					const d = event.subject;
					if (d.id !== 'center') {
						d.fx = null;
						d.fy = null;
					}
				});

			nodeGroups.call(drag as unknown as (sel: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>) => void);
		}
	}

	// --- First-time user detection ---
	async function checkOnboarding(): Promise<boolean> {
		if (typeof localStorage === 'undefined') return false;
		if (localStorage.getItem('lifeos_onboarded') === 'true') return false;
		try {
			const prefs = await api.preferences.get();
			if (prefs.length === 0) {
				goto(`${base}/onboarding`);
				return true;
			}
			// Has preferences -- mark as onboarded so we don't check again
			localStorage.setItem('lifeos_onboarded', 'true');
		} catch {
			// API error -- don't block the dashboard
		}
		return false;
	}

	// --- Lifecycle ---
	onMount(async () => {
		const redirected = await checkOnboarding();
		if (redirected) return;
		await fetchData();
		loading = false;
		requestAnimationFrame(() => buildGraph());
	});

	onDestroy(() => {
		if (simulation) simulation.stop();
		if (jitterInterval) clearInterval(jitterInterval);
	});
</script>

<svelte:head>
	<title>LifeOS</title>
</svelte:head>

<div class="dashboard">
	<!-- Date picker -->
	<div class="date-picker">
		<button class="date-arrow" onclick={() => shiftDate(-1)} aria-label="Previous day">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
		</button>
		<span class="date-label">{dateLabel}</span>
		<button class="date-arrow" onclick={() => shiftDate(1)} aria-label="Next day" disabled={isToday(selectedDate)}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
		</button>
	</div>

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
		position: relative;
	}

	/* Date picker */
	.date-picker {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		z-index: 10;
		background: rgba(26, 26, 36, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 4px 8px;
	}

	.date-arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		border-radius: 8px;
		transition: all 0.2s ease;
	}

	.date-arrow:not(:disabled):hover {
		background: var(--bg-elevated);
		color: var(--text-primary);
	}

	.date-arrow:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.date-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary);
		min-width: 52px;
		text-align: center;
		font-family: 'Inter', sans-serif;
		font-variant-numeric: tabular-nums;
	}

	/* Graph container */
	.graph-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		touch-action: none;
	}

	.graph-container svg {
		width: 100%;
		height: 100%;
	}

	.loading-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Breathing animation on inner node groups */
	:global(.node-inner) {
		transform-origin: 0px 0px;
	}
	:global(.breathing-0) {
		animation: breathe 3s ease-in-out 0s infinite;
	}
	:global(.breathing-1) {
		animation: breathe 3s ease-in-out 0.6s infinite;
	}
	:global(.breathing-2) {
		animation: breathe 3s ease-in-out 1.2s infinite;
	}
	:global(.breathing-3) {
		animation: breathe 3s ease-in-out 1.8s infinite;
	}
	:global(.breathing-4) {
		animation: breathe 3s ease-in-out 2.4s infinite;
	}

	@keyframes breathe {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.02);
		}
	}
</style>
