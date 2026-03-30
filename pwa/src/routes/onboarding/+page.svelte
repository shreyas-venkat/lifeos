<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { api } from '$lib/api';

	let step = $state(0);
	let direction = $state<'next' | 'back'>('next');
	let saving = $state(false);

	// --- Step 2: Goals ---
	let calorieTarget = $state(1200);
	let proteinTarget = $state(80);
	let stepGoal = $state(5000);
	let sleepTarget = $state(7);

	// --- Step 3: Dietary ---
	const veggieOptions = [
		'Spinach',
		'Bell Peppers',
		'Bok Choy',
		'Enoki Mushrooms',
		'Seafood Mushrooms',
		'Broccoli',
		'Carrots',
		'Zucchini',
		'Sweet Potatoes',
		'Kale',
		'Green Beans',
		'Asparagus',
	];
	let selectedVeggies = $state<Set<string>>(
		new Set(['Spinach', 'Bell Peppers', 'Bok Choy', 'Enoki Mushrooms', 'Seafood Mushrooms']),
	);
	let weeklyBudget = $state(150);

	// --- Step 4: Supplements ---
	interface SupplementOption {
		name: string;
		dosage: number;
		unit: string;
		selected: boolean;
		timeOfDay: 'morning' | 'evening';
	}

	let supplementOptions = $state<SupplementOption[]>([
		{ name: 'Vitamin D3', dosage: 2500, unit: 'IU', selected: false, timeOfDay: 'morning' },
		{ name: 'Omega-3', dosage: 1000, unit: 'mg', selected: false, timeOfDay: 'morning' },
		{ name: 'Magnesium', dosage: 200, unit: 'mg', selected: false, timeOfDay: 'evening' },
		{ name: 'Zinc', dosage: 25, unit: 'mg', selected: false, timeOfDay: 'morning' },
		{ name: 'Vitamin C', dosage: 1000, unit: 'mg', selected: false, timeOfDay: 'morning' },
		{ name: 'Melatonin', dosage: 3, unit: 'mg', selected: false, timeOfDay: 'evening' },
	]);

	const totalSteps = 5;

	function goNext() {
		if (step < totalSteps - 1) {
			direction = 'next';
			step += 1;
		}
	}

	function goBack() {
		if (step > 0) {
			direction = 'back';
			step -= 1;
		}
	}

	function toggleVeggie(name: string) {
		const next = new Set(selectedVeggies);
		if (next.has(name)) {
			next.delete(name);
		} else {
			next.add(name);
		}
		selectedVeggies = next;
	}

	function toggleSupplement(index: number) {
		supplementOptions[index].selected = !supplementOptions[index].selected;
	}

	function toggleTimeOfDay(index: number) {
		supplementOptions[index].timeOfDay =
			supplementOptions[index].timeOfDay === 'morning' ? 'evening' : 'morning';
	}

	async function saveGoals() {
		saving = true;
		try {
			await api.preferences.update({
				daily_calorie_target: String(calorieTarget),
				daily_protein_target: String(proteinTarget),
				daily_step_goal: String(stepGoal),
				sleep_target_hours: String(sleepTarget),
			});
		} catch {
			// Continue even if save fails -- preferences can be set later
		} finally {
			saving = false;
		}
	}

	async function saveDietary() {
		saving = true;
		try {
			await api.preferences.update({
				preferred_veggies: [...selectedVeggies].join(', '),
				weekly_grocery_budget: String(weeklyBudget),
			});
		} catch {
			// Continue even if save fails
		} finally {
			saving = false;
		}
	}

	async function saveSupplements() {
		saving = true;
		try {
			const selected = supplementOptions.filter((s) => s.selected);
			for (const supp of selected) {
				await api.supplements.add({
					name: supp.name,
					dosage: supp.dosage,
					unit: supp.unit,
					time_of_day: supp.timeOfDay,
				});
			}
		} catch {
			// Continue even if save fails
		} finally {
			saving = false;
		}
	}

	async function handleNext() {
		if (step === 1) {
			await saveGoals();
		} else if (step === 2) {
			await saveDietary();
		} else if (step === 3) {
			await saveSupplements();
		}
		goNext();
	}

	function finishOnboarding() {
		localStorage.setItem('lifeos_onboarded', 'true');
		goto(`${base}/`);
	}
</script>

<svelte:head>
	<title>Welcome to LifeOS</title>
</svelte:head>

<div class="onboarding-overlay">
	<div class="onboarding-container">
		<!-- Step content with slide transition -->
		<div class="step-viewport">
			{#key step}
				<div class="step-slide {direction === 'next' ? 'slide-in-right' : 'slide-in-left'}">
					{#if step === 0}
						<!-- Welcome -->
						<div class="step-content welcome-step">
							<div class="logo-container">
								<svg class="logo-svg" viewBox="0 0 80 80" fill="none">
									<circle cx="40" cy="40" r="36" stroke="#6366f1" stroke-width="2" opacity="0.3">
										<animate attributeName="r" values="34;38;34" dur="3s" repeatCount="indefinite" />
										<animate attributeName="opacity" values="0.2;0.4;0.2" dur="3s" repeatCount="indefinite" />
									</circle>
									<circle cx="40" cy="40" r="20" fill="#6366f1" opacity="0.15">
										<animate attributeName="r" values="18;22;18" dur="2.5s" repeatCount="indefinite" />
									</circle>
									<circle cx="40" cy="40" r="8" fill="#6366f1" />
									<!-- Satellite nodes -->
									<circle cx="40" cy="12" r="4" fill="#ef4444" opacity="0.8">
										<animate attributeName="cy" values="11;13;11" dur="2s" repeatCount="indefinite" />
									</circle>
									<circle cx="68" cy="40" r="4" fill="#f59e0b" opacity="0.8">
										<animate attributeName="cx" values="67;69;67" dur="2.2s" repeatCount="indefinite" />
									</circle>
									<circle cx="40" cy="68" r="4" fill="#22c55e" opacity="0.8">
										<animate attributeName="cy" values="67;69;67" dur="1.8s" repeatCount="indefinite" />
									</circle>
									<circle cx="12" cy="40" r="4" fill="#8b5cf6" opacity="0.8">
										<animate attributeName="cx" values="11;13;11" dur="2.4s" repeatCount="indefinite" />
									</circle>
									<!-- Connection lines -->
									<line x1="40" y1="32" x2="40" y2="16" stroke="#ef4444" stroke-width="1" opacity="0.3" />
									<line x1="48" y1="40" x2="64" y2="40" stroke="#f59e0b" stroke-width="1" opacity="0.3" />
									<line x1="40" y1="48" x2="40" y2="64" stroke="#22c55e" stroke-width="1" opacity="0.3" />
									<line x1="32" y1="40" x2="16" y2="40" stroke="#8b5cf6" stroke-width="1" opacity="0.3" />
								</svg>
							</div>
							<h1>Welcome to LifeOS</h1>
							<p class="subtitle">Your personal life management assistant</p>
							<p class="hint">Let's get you set up in 2 minutes</p>
							<button class="primary-btn" onclick={goNext}>Get Started</button>
						</div>
					{:else if step === 1}
						<!-- Goals -->
						<div class="step-content">
							<h2>What are your goals?</h2>
							<p class="step-desc">Set your daily targets. You can change these anytime.</p>

							<div class="slider-group">
								<label class="slider-label" for="cal-slider">
									<span>Daily Calories</span>
									<span class="slider-value">{calorieTarget} kcal</span>
								</label>
								<input
									id="cal-slider"
									type="range"
									min="800"
									max="3000"
									step="50"
									bind:value={calorieTarget}
									class="range-slider"
								/>
								<div class="range-ticks">
									<span>800</span>
									<span>3000</span>
								</div>
							</div>

							<div class="slider-group">
								<label class="slider-label" for="protein-slider">
									<span>Daily Protein</span>
									<span class="slider-value">{proteinTarget}g</span>
								</label>
								<input
									id="protein-slider"
									type="range"
									min="40"
									max="200"
									step="5"
									bind:value={proteinTarget}
									class="range-slider"
								/>
								<div class="range-ticks">
									<span>40g</span>
									<span>200g</span>
								</div>
							</div>

							<div class="slider-group">
								<label class="slider-label" for="steps-slider">
									<span>Daily Steps</span>
									<span class="slider-value">{stepGoal.toLocaleString()}</span>
								</label>
								<input
									id="steps-slider"
									type="range"
									min="2000"
									max="15000"
									step="500"
									bind:value={stepGoal}
									class="range-slider"
								/>
								<div class="range-ticks">
									<span>2K</span>
									<span>15K</span>
								</div>
							</div>

							<div class="slider-group">
								<label class="slider-label" for="sleep-slider">
									<span>Sleep Target</span>
									<span class="slider-value">{sleepTarget}h</span>
								</label>
								<input
									id="sleep-slider"
									type="range"
									min="5"
									max="10"
									step="0.5"
									bind:value={sleepTarget}
									class="range-slider"
								/>
								<div class="range-ticks">
									<span>5h</span>
									<span>10h</span>
								</div>
							</div>
						</div>
					{:else if step === 2}
						<!-- Dietary -->
						<div class="step-content">
							<h2>Any dietary preferences?</h2>
							<p class="step-desc">Select veggies you like and set your weekly budget.</p>

							<div class="veggie-grid">
								{#each veggieOptions as veggie}
									<button
										class="veggie-chip"
										class:selected={selectedVeggies.has(veggie)}
										onclick={() => toggleVeggie(veggie)}
									>
										{#if selectedVeggies.has(veggie)}
											<svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
											</svg>
										{/if}
										{veggie}
									</button>
								{/each}
							</div>

							<div class="slider-group" style="margin-top: 1.5rem;">
								<label class="slider-label" for="budget-slider">
									<span>Weekly Grocery Budget</span>
									<span class="slider-value">${weeklyBudget}</span>
								</label>
								<input
									id="budget-slider"
									type="range"
									min="50"
									max="300"
									step="10"
									bind:value={weeklyBudget}
									class="range-slider"
								/>
								<div class="range-ticks">
									<span>$50</span>
									<span>$300</span>
								</div>
							</div>
						</div>
					{:else if step === 3}
						<!-- Supplements -->
						<div class="step-content">
							<h2>Do you take supplements?</h2>
							<p class="step-desc">Select any supplements you currently take.</p>

							<div class="supplement-list">
								{#each supplementOptions as supp, i}
									<div class="supp-row" class:supp-selected={supp.selected}>
										<button class="supp-toggle" onclick={() => toggleSupplement(i)}>
											<div class="supp-checkbox" class:checked={supp.selected}>
												{#if supp.selected}
													<svg viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
													</svg>
												{/if}
											</div>
											<div class="supp-info">
												<span class="supp-name">{supp.name}</span>
												<span class="supp-dosage">{supp.dosage} {supp.unit}</span>
											</div>
										</button>
										{#if supp.selected}
											<button
												class="time-toggle"
												onclick={() => toggleTimeOfDay(i)}
											>
												{#if supp.timeOfDay === 'morning'}
													<svg class="time-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<circle cx="12" cy="12" r="5" />
														<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
													</svg>
													<span>AM</span>
												{:else}
													<svg class="time-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
													</svg>
													<span>PM</span>
												{/if}
											</button>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{:else if step === 4}
						<!-- Done -->
						<div class="step-content welcome-step">
							<div class="done-icon">
								<svg viewBox="0 0 64 64" fill="none">
									<circle cx="32" cy="32" r="28" fill="#22c55e" opacity="0.15">
										<animate attributeName="r" values="26;30;26" dur="2s" repeatCount="indefinite" />
									</circle>
									<circle cx="32" cy="32" r="20" fill="#22c55e" opacity="0.3" />
									<path d="M22 32l6 6 14-14" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
										<animate attributeName="stroke-dashoffset" from="40" to="0" dur="0.6s" fill="freeze" />
										<set attributeName="stroke-dasharray" to="40" />
									</path>
								</svg>
							</div>
							<h1>You're all set!</h1>
							<p class="subtitle">LifeOS will learn your preferences over time</p>
							<button class="primary-btn" onclick={finishOnboarding}>Open Dashboard</button>
						</div>
					{/if}
				</div>
			{/key}
		</div>

		<!-- Navigation -->
		{#if step > 0 && step < totalSteps - 1}
			<div class="nav-bar">
				<button class="nav-btn back-btn" onclick={goBack}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M15 18l-6-6 6-6" />
					</svg>
					Back
				</button>
				<button class="nav-btn next-btn" onclick={handleNext} disabled={saving}>
					{#if saving}
						<span class="spinner"></span>
					{:else}
						Next
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M9 18l6-6-6-6" />
						</svg>
					{/if}
				</button>
			</div>
		{/if}

		<!-- Progress dots -->
		<div class="progress-dots">
			{#each Array(totalSteps) as _, i}
				<button
					class="dot"
					class:active={i === step}
					class:completed={i < step}
					onclick={() => { if (i < step) { direction = 'back'; step = i; } }}
					aria-label="Step {i + 1}"
				></button>
			{/each}
		</div>
	</div>
</div>

<style>
	/* Full-screen overlay */
	.onboarding-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: var(--bg-primary);
		overflow: hidden;
	}

	.onboarding-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		height: 100dvh;
		max-width: 480px;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	/* Step viewport for transitions */
	.step-viewport {
		flex: 1;
		position: relative;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
	}

	.step-slide {
		min-height: 100%;
		display: flex;
		align-items: flex-start;
		padding-top: 2rem;
		padding-bottom: 6rem;
	}

	.step-content {
		width: 100%;
	}

	/* Slide animations */
	.slide-in-right {
		animation: slideInRight 300ms ease-out;
	}

	.slide-in-left {
		animation: slideInLeft 300ms ease-out;
	}

	@keyframes slideInRight {
		from {
			opacity: 0;
			transform: translateX(40px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	@keyframes slideInLeft {
		from {
			opacity: 0;
			transform: translateX(-40px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	/* Welcome step */
	.welcome-step {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		min-height: 70vh;
		gap: 0.75rem;
	}

	.logo-container {
		width: 120px;
		height: 120px;
		margin-bottom: 1rem;
	}

	.logo-svg {
		width: 100%;
		height: 100%;
	}

	.done-icon {
		width: 96px;
		height: 96px;
		margin-bottom: 1rem;
	}

	.done-icon svg {
		width: 100%;
		height: 100%;
	}

	h1 {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}

	h2 {
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 0.25rem;
		letter-spacing: -0.01em;
	}

	.subtitle {
		font-size: 1rem;
		color: var(--text-secondary);
	}

	.hint {
		font-size: 0.85rem;
		color: var(--text-secondary);
		opacity: 0.7;
	}

	.step-desc {
		font-size: 0.9rem;
		color: var(--text-secondary);
		margin-bottom: 1.5rem;
	}

	/* Primary button */
	.primary-btn {
		margin-top: 1.5rem;
		padding: 14px 40px;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 14px;
		font-size: 1rem;
		font-weight: 600;
		transition: transform 150ms ease, opacity 150ms ease;
	}

	.primary-btn:active {
		transform: scale(0.97);
	}

	/* Slider groups */
	.slider-group {
		margin-bottom: 1.25rem;
	}

	.slider-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.slider-value {
		font-weight: 600;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}

	.range-slider {
		width: 100%;
		height: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--bg-elevated);
		border-radius: 3px;
		outline: none;
	}

	.range-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--accent);
		cursor: pointer;
		border: 3px solid var(--bg-primary);
		box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
	}

	.range-slider::-moz-range-thumb {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--accent);
		cursor: pointer;
		border: 3px solid var(--bg-primary);
		box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
	}

	.range-ticks {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: var(--text-secondary);
		opacity: 0.6;
		margin-top: 4px;
	}

	/* Veggie grid */
	.veggie-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.veggie-chip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 14px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 20px;
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		transition: all 200ms ease;
	}

	.veggie-chip.selected {
		background: var(--accent-glow);
		border-color: var(--accent);
		color: var(--accent);
	}

	.check-icon {
		width: 14px;
		height: 14px;
	}

	/* Supplement list */
	.supplement-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.supp-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 2px;
		transition: all 200ms ease;
	}

	.supp-row.supp-selected {
		border-color: var(--accent);
		background: rgba(99, 102, 241, 0.05);
	}

	.supp-toggle {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		padding: 12px;
		background: none;
		border: none;
		color: var(--text-primary);
		cursor: pointer;
		text-align: left;
	}

	.supp-checkbox {
		width: 22px;
		height: 22px;
		border-radius: 6px;
		border: 2px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 200ms ease;
	}

	.supp-checkbox.checked {
		background: var(--accent);
		border-color: var(--accent);
	}

	.supp-checkbox svg {
		width: 14px;
		height: 14px;
		color: #fff;
	}

	.supp-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.supp-name {
		font-size: 0.9rem;
		font-weight: 500;
	}

	.supp-dosage {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.time-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		margin-right: 8px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 200ms ease;
	}

	.time-toggle:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.time-icon {
		width: 14px;
		height: 14px;
	}

	/* Navigation bar */
	.nav-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 0;
		flex-shrink: 0;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 20px;
		border: none;
		border-radius: 12px;
		font-size: 0.9rem;
		font-weight: 500;
		transition: all 150ms ease;
	}

	.back-btn {
		background: var(--bg-card);
		color: var(--text-secondary);
		border: 1px solid var(--border);
	}

	.next-btn {
		background: var(--accent);
		color: #fff;
	}

	.next-btn:disabled {
		opacity: 0.6;
	}

	.next-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	/* Spinner */
	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Progress dots */
	.progress-dots {
		display: flex;
		justify-content: center;
		gap: 8px;
		padding: 1rem 0 2rem;
		flex-shrink: 0;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: none;
		background: var(--bg-elevated);
		padding: 0;
		cursor: default;
		transition: all 300ms ease;
	}

	.dot.active {
		width: 24px;
		border-radius: 4px;
		background: var(--accent);
	}

	.dot.completed {
		background: var(--accent);
		opacity: 0.5;
		cursor: pointer;
	}
</style>
