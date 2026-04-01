<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import type { PreferenceRow } from '$lib/api';
	import { requestPermission, getPermissionState } from '$lib/notifications';

	// --------------- types & defaults ---------------

	interface Settings {
		// Profile
		name: string;
		weight: string;
		location: string;

		// Dietary goals
		daily_calorie_target: number;
		daily_protein_target: number;
		weekly_grocery_budget: number;
		veggie_restrictions: string;

		// Health goals
		daily_step_goal: number;
		sleep_target: number;
		water_target: number;

		// Supplement settings
		auto_adjust_supplements: boolean;
		weight_aware_dosing: boolean;

		// Notifications
		morning_briefing: boolean;
		email_digest: boolean;
		cooking_reminder: boolean;
		supplement_reminder: boolean;
	}

	const defaults: Settings = {
		name: 'Shrey',
		weight: '--',
		location: 'Calgary, AB',
		daily_calorie_target: 1200,
		daily_protein_target: 80,
		weekly_grocery_budget: 150,
		veggie_restrictions: 'spinach, bell peppers, bok choy, enoki mushrooms, seafood mushrooms',
		daily_step_goal: 5000,
		sleep_target: 7,
		water_target: 8,
		auto_adjust_supplements: true,
		weight_aware_dosing: true,
		morning_briefing: true,
		email_digest: true,
		cooking_reminder: true,
		supplement_reminder: true,
	};

	// --------------- state ---------------

	let settings = $state<Settings>({ ...defaults });
	let loading = $state(true);
	let saving = $state(false);
	let saveStatus = $state<string | null>(null);
	let editingRestrictions = $state(false);
	let restrictionsInput = $state('');
	let statusTimeout: ReturnType<typeof setTimeout> | undefined;
	let notifPermission = $state<string>(getPermissionState());

	async function toggleNotifications() {
		if (notifPermission === 'granted') return;
		const result = await requestPermission();
		notifPermission = result;
	}

	// --------------- helpers ---------------

	function parseBool(v: string): boolean {
		return v === 'true' || v === '1' || v === 'on';
	}

	function parseSettings(rows: PreferenceRow[]): Partial<Settings> {
		const partial: Record<string, unknown> = {};
		for (const row of rows) {
			const k = row.key as keyof Settings;
			if (k in defaults) {
				const def = defaults[k];
				if (typeof def === 'boolean') {
					partial[k] = parseBool(row.value);
				} else if (typeof def === 'number') {
					const n = Number(row.value);
					if (!isNaN(n)) partial[k] = n;
				} else {
					partial[k] = row.value;
				}
			}
		}
		return partial as Partial<Settings>;
	}

	function settingsToPrefs(s: Settings): Array<{ key: string; value: string; skill: string }> {
		const prefs: Array<{ key: string; value: string; skill: string }> = [];
		const skillMap: Record<string, string> = {
			daily_calorie_target: 'dietary',
			daily_protein_target: 'dietary',
			weekly_grocery_budget: 'dietary',
			veggie_restrictions: 'dietary',
			daily_step_goal: 'health',
			sleep_target: 'health',
			water_target: 'health',
			auto_adjust_supplements: 'supplements',
			weight_aware_dosing: 'supplements',
			morning_briefing: 'notifications',
			email_digest: 'notifications',
			cooking_reminder: 'notifications',
			supplement_reminder: 'notifications',
			location: 'profile',
		};

		for (const [key, value] of Object.entries(s)) {
			if (key === 'name' || key === 'weight') continue; // read-only
			const skill = skillMap[key] || 'general';
			prefs.push({ key, value: String(value), skill });
		}
		return prefs;
	}

	async function save() {
		saving = true;
		if (statusTimeout) clearTimeout(statusTimeout);
		try {
			const prefs = settingsToPrefs(settings);
			await api.preferences.update(prefs);
			saveStatus = 'saved';
		} catch {
			saveStatus = 'error';
		} finally {
			saving = false;
			statusTimeout = setTimeout(() => {
				saveStatus = null;
			}, 2000);
		}
	}

	function handleNumberBlur(_key: keyof Settings) {
		return () => save();
	}

	function handleToggle(key: keyof Settings) {
		return () => {
			const current = settings[key];
			if (typeof current === 'boolean') {
				settings = { ...settings, [key]: !current };
			}
			save();
		};
	}

	function startEditRestrictions() {
		restrictionsInput = settings.veggie_restrictions;
		editingRestrictions = true;
	}

	function saveRestrictions() {
		settings.veggie_restrictions = restrictionsInput;
		editingRestrictions = false;
		save();
	}

	function cancelRestrictions() {
		editingRestrictions = false;
	}

	async function exportData() {
		try {
			const [health, calories, supplements, pantry, prefs] = await Promise.all([
				api.health.today(),
				api.calories.today(),
				api.supplements.today(),
				api.pantry.list(),
				api.preferences.get(),
			]);
			const data = { health, calories, supplements, pantry, preferences: prefs, exported_at: new Date().toISOString() };
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `lifeos-export-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			// export failed silently
		}
	}

	async function clearCache() {
		if ('caches' in window) {
			const keys = await caches.keys();
			await Promise.all(keys.map((k) => caches.delete(k)));
			saveStatus = 'cache-cleared';
			if (statusTimeout) clearTimeout(statusTimeout);
			statusTimeout = setTimeout(() => {
				saveStatus = null;
			}, 2000);
		}
	}

	// --------------- lifecycle ---------------

	onMount(async () => {
		const [prefs, healthData] = await Promise.all([
			api.preferences.get(),
			api.health.today(),
		]);
		const parsed = parseSettings(prefs);
		settings = { ...defaults, ...parsed };

		// Get latest weight from health metrics
		const weightMetric = healthData.find((m) => m.metric_type === 'weight');
		if (weightMetric) {
			settings.weight = `${weightMetric.value} ${weightMetric.unit || 'lbs'}`;
		}

		loading = false;
	});
</script>

<svelte:head>
	<title>Settings - LifeOS</title>
</svelte:head>

<div class="page">
	<div class="header">
		<h1>Settings</h1>
		{#if saveStatus === 'saved'}
			<span class="status-badge saved fade-in">Saved</span>
		{:else if saveStatus === 'error'}
			<span class="status-badge error fade-in">Error</span>
		{:else if saveStatus === 'cache-cleared'}
			<span class="status-badge saved fade-in">Cache cleared</span>
		{:else if saving}
			<span class="status-badge saving">Saving...</span>
		{/if}
	</div>

	<!-- Quick Links Grid -->
	<section class="quick-links fade-in">
		<div class="links-grid">
			{#each [
				{ href: '/packages', label: 'Packages', icon: '📦' },
				{ href: '/pantry', label: 'Pantry', icon: '🥫' },
				{ href: '/supplements', label: 'Supplements', icon: '💊' },
				{ href: '/habits', label: 'Habits', icon: '✓' },
				{ href: '/exercise', label: 'Exercise', icon: '💪' },
				{ href: '/body', label: 'Body', icon: '⚖' },
				{ href: '/sleep', label: 'Sleep', icon: '😴' },
				{ href: '/calendar', label: 'Calendar', icon: '📅' },
				{ href: '/reminders', label: 'Reminders', icon: '🔔' },
				{ href: '/report', label: 'Report', icon: '📊' },
				{ href: '/bills', label: 'Bills', icon: '🧾' },
				{ href: '/onboarding', label: 'Setup', icon: '⚙' },
			] as link}
				<a href="{base}{link.href}" class="link-card">
					<span class="link-icon">{link.icon}</span>
					<span class="link-label">{link.label}</span>
				</a>
			{/each}
		</div>
	</section>

	{#if loading}
		{#each Array(6) as _}
			<div class="skeleton" style="height: 80px; margin-bottom: 1rem;"></div>
		{/each}
	{:else}
		<!-- Profile -->
		<section class="settings-section fade-in">
			<h2>Profile</h2>
			<div class="settings-card">
				<div class="setting-row">
					<span class="setting-label">Name</span>
					<span class="setting-value readonly">{settings.name}</span>
				</div>
				<div class="setting-row">
					<span class="setting-label">Weight</span>
					<span class="setting-value readonly">{settings.weight}</span>
				</div>
				<div class="setting-row no-border">
					<span class="setting-label">Location</span>
					<span class="setting-value readonly">{settings.location}</span>
				</div>
			</div>
		</section>

		<!-- Dietary Goals -->
		<section class="settings-section fade-in">
			<h2>Dietary Goals</h2>
			<div class="settings-card">
				<div class="setting-row">
					<span class="setting-label">Daily calorie target</span>
					<div class="input-group">
						<input
							type="number"
							bind:value={settings.daily_calorie_target}
							onblur={handleNumberBlur('daily_calorie_target')}
							class="setting-input"
							min="500"
							max="5000"
							step="50"
						/>
						<span class="input-unit">kcal</span>
					</div>
				</div>
				<div class="setting-row">
					<span class="setting-label">Daily protein target</span>
					<div class="input-group">
						<input
							type="number"
							bind:value={settings.daily_protein_target}
							onblur={handleNumberBlur('daily_protein_target')}
							class="setting-input"
							min="20"
							max="300"
							step="5"
						/>
						<span class="input-unit">g</span>
					</div>
				</div>
				<div class="setting-row">
					<span class="setting-label">Weekly grocery budget</span>
					<div class="input-group">
						<span class="input-unit prefix">$</span>
						<input
							type="number"
							bind:value={settings.weekly_grocery_budget}
							onblur={handleNumberBlur('weekly_grocery_budget')}
							class="setting-input with-prefix"
							min="50"
							max="500"
							step="10"
						/>
						<span class="input-unit">CAD</span>
					</div>
				</div>
				<div class="setting-row no-border">
					<div class="restrictions-row">
						<span class="setting-label">Veggie restrictions</span>
						{#if editingRestrictions}
							<div class="restrictions-edit">
								<textarea
									bind:value={restrictionsInput}
									class="restrictions-textarea"
									rows="3"
									onkeydown={(e) => {
										if (e.key === 'Escape') cancelRestrictions();
									}}
								></textarea>
								<div class="restrictions-actions">
									<button class="btn-sm accent" onclick={saveRestrictions}>Save</button>
									<button class="btn-sm ghost" onclick={cancelRestrictions}>Cancel</button>
								</div>
							</div>
						{:else}
							<div class="restrictions-display">
								<p class="restrictions-text">{settings.veggie_restrictions}</p>
								<button class="btn-sm ghost" onclick={startEditRestrictions}>Edit</button>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<!-- Health Goals -->
		<section class="settings-section fade-in">
			<h2>Health Goals</h2>
			<div class="settings-card">
				<div class="setting-row">
					<span class="setting-label">Daily step goal</span>
					<div class="input-group">
						<input
							type="number"
							bind:value={settings.daily_step_goal}
							onblur={handleNumberBlur('daily_step_goal')}
							class="setting-input"
							min="1000"
							max="30000"
							step="500"
						/>
						<span class="input-unit">steps</span>
					</div>
				</div>
				<div class="setting-row">
					<span class="setting-label">Sleep target</span>
					<div class="input-group">
						<input
							type="number"
							bind:value={settings.sleep_target}
							onblur={handleNumberBlur('sleep_target')}
							class="setting-input"
							min="4"
							max="12"
							step="0.5"
						/>
						<span class="input-unit">hours</span>
					</div>
				</div>
				<div class="setting-row no-border">
					<span class="setting-label">Water target</span>
					<div class="input-group">
						<input
							type="number"
							bind:value={settings.water_target}
							onblur={handleNumberBlur('water_target')}
							class="setting-input"
							min="4"
							max="20"
							step="1"
						/>
						<span class="input-unit">glasses</span>
					</div>
				</div>
			</div>
		</section>

		<!-- Supplement Settings -->
		<section class="settings-section fade-in">
			<h2>Supplement Settings</h2>
			<div class="settings-card">
				<div class="setting-row">
					<span class="setting-label">Auto-adjust based on health data</span>
					<button
						class="toggle"
						class:on={settings.auto_adjust_supplements}
						onclick={handleToggle('auto_adjust_supplements')}
						role="switch"
						aria-checked={settings.auto_adjust_supplements}
						aria-label="Auto-adjust based on health data"
					>
						<span class="toggle-thumb"></span>
					</button>
				</div>
				<div class="setting-row">
					<span class="setting-label">Weight-aware dosing</span>
					<button
						class="toggle"
						class:on={settings.weight_aware_dosing}
						onclick={handleToggle('weight_aware_dosing')}
						role="switch"
						aria-checked={settings.weight_aware_dosing}
						aria-label="Weight-aware dosing"
					>
						<span class="toggle-thumb"></span>
					</button>
				</div>
				<div class="setting-row no-border">
					<a href="{base}/supplements" class="setting-link">
						View supplements
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M9 18l6-6-6-6" />
						</svg>
					</a>
				</div>
			</div>
		</section>

		<!-- Notifications -->
		<section class="settings-section fade-in">
			<h2>Notifications</h2>
			<p class="section-note">Toggle state is saved to preferences. To actually pause/unpause scheduled tasks, use Discord: "pause task [task-name]".</p>
			<div class="settings-card">
				<div class="setting-row">
					<div class="setting-label-group">
						<span class="setting-label">Browser notifications</span>
						<span class="setting-sub">
							{#if notifPermission === 'granted'}
								Enabled
							{:else if notifPermission === 'denied'}
								Blocked in browser settings
							{:else if notifPermission === 'unsupported'}
								Not supported
							{:else}
								Tap to enable
							{/if}
						</span>
					</div>
					<button
						class="toggle"
						class:on={notifPermission === 'granted'}
						onclick={toggleNotifications}
						role="switch"
						aria-checked={notifPermission === 'granted'}
						aria-label="Browser notifications"
						disabled={notifPermission === 'granted' || notifPermission === 'denied' || notifPermission === 'unsupported'}
					>
						<span class="toggle-thumb"></span>
					</button>
				</div>
				<div class="setting-row">
					<div class="setting-label-group">
						<span class="setting-label">Morning briefing</span>
						<span class="setting-sub">6 AM weekdays</span>
					</div>
					<button
						class="toggle"
						class:on={settings.morning_briefing}
						onclick={handleToggle('morning_briefing')}
						role="switch"
						aria-checked={settings.morning_briefing}
						aria-label="Morning briefing"
					>
						<span class="toggle-thumb"></span>
					</button>
				</div>
				<div class="setting-row">
					<div class="setting-label-group">
						<span class="setting-label">Email digest</span>
						<span class="setting-sub">8 PM daily</span>
					</div>
					<button
						class="toggle"
						class:on={settings.email_digest}
						onclick={handleToggle('email_digest')}
						role="switch"
						aria-checked={settings.email_digest}
						aria-label="Email digest"
					>
						<span class="toggle-thumb"></span>
					</button>
				</div>
				<div class="setting-row">
					<div class="setting-label-group">
						<span class="setting-label">Cooking reminder</span>
						<span class="setting-sub">7 PM daily</span>
					</div>
					<button
						class="toggle"
						class:on={settings.cooking_reminder}
						onclick={handleToggle('cooking_reminder')}
						role="switch"
						aria-checked={settings.cooking_reminder}
						aria-label="Cooking reminder"
					>
						<span class="toggle-thumb"></span>
					</button>
				</div>
				<div class="setting-row no-border">
					<div class="setting-label-group">
						<span class="setting-label">Supplement reminder</span>
						<span class="setting-sub">6 AM + 9 PM</span>
					</div>
					<button
						class="toggle"
						class:on={settings.supplement_reminder}
						onclick={handleToggle('supplement_reminder')}
						role="switch"
						aria-checked={settings.supplement_reminder}
						aria-label="Supplement reminder"
					>
						<span class="toggle-thumb"></span>
					</button>
				</div>
			</div>
		</section>

		<!-- Data & Privacy -->
		<section class="settings-section fade-in">
			<h2>Data & Privacy</h2>
			<div class="settings-card">
				<div class="setting-row">
					<span class="setting-label">Export all data</span>
					<button class="btn-sm accent" onclick={exportData}>
						Export JSON
					</button>
				</div>
				<div class="setting-row">
					<span class="setting-label">Clear PWA cache</span>
					<button class="btn-sm ghost" onclick={clearCache}>
						Clear
					</button>
				</div>
				<div class="setting-row no-border">
					<div class="about-info">
						<span class="setting-label">About</span>
						<span class="setting-sub">LifeOS v0.0.1 &middot; NanoClaw + MotherDuck + Discord</span>
					</div>
				</div>
			</div>
		</section>
	{/if}
</div>

<style>
	.quick-links {
		margin-bottom: 1.5rem;
	}

	.links-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 10px;
	}

	.link-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 12px 4px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		text-decoration: none;
		color: var(--text-primary);
		transition: background 0.2s;
	}

	.link-card:hover {
		background: var(--bg-elevated);
	}

	.link-icon {
		font-size: 1.3rem;
	}

	.link-label {
		font-size: 0.68rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 1.25rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 600;
	}

	.status-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 3px 10px;
		border-radius: 20px;
		letter-spacing: 0.02em;
	}

	.status-badge.saved {
		background: rgba(34, 197, 94, 0.15);
		color: var(--success);
	}

	.status-badge.error {
		background: rgba(239, 68, 68, 0.15);
		color: var(--danger);
	}

	.status-badge.saving {
		background: rgba(99, 102, 241, 0.15);
		color: var(--accent);
	}

	/* Section layout */

	.settings-section {
		margin-bottom: 1.5rem;
	}

	.settings-section h2 {
		font-size: 0.75rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		margin-bottom: 8px;
		padding-left: 4px;
	}

	.section-note {
		font-size: 0.75rem;
		color: var(--text-secondary);
		margin-bottom: 8px;
		padding-left: 4px;
		opacity: 0.7;
		line-height: 1.4;
	}

	.settings-card {
		background: var(--bg-card);
		border-radius: 12px;
		border: 1px solid var(--border);
		overflow: hidden;
	}

	/* Rows */

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
		min-height: 50px;
	}

	.setting-row.no-border {
		border-bottom: none;
	}

	.setting-label {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.setting-value.readonly {
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	.setting-label-group {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.setting-sub {
		font-size: 0.72rem;
		color: var(--text-secondary);
		opacity: 0.7;
	}

	/* Number inputs */

	.input-group {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.setting-input {
		width: 72px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px 8px;
		color: var(--text-primary);
		font-size: 0.85rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
		transition: border-color 0.2s;
	}

	.setting-input.with-prefix {
		padding-left: 4px;
	}

	.setting-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	/* Remove number input spinners */
	.setting-input::-webkit-outer-spin-button,
	.setting-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.setting-input {
		-moz-appearance: textfield;
		appearance: textfield;
	}

	.input-unit {
		font-size: 0.75rem;
		color: var(--text-secondary);
		min-width: fit-content;
	}

	.input-unit.prefix {
		margin-right: -2px;
	}

	/* Toggle switch */

	.toggle {
		position: relative;
		width: 44px;
		height: 26px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 13px;
		cursor: pointer;
		transition: background 0.25s, border-color 0.25s;
		flex-shrink: 0;
	}

	.toggle.on {
		background: var(--accent);
		border-color: var(--accent);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 20px;
		height: 20px;
		background: var(--text-primary);
		border-radius: 50%;
		transition: transform 0.25s;
	}

	.toggle.on .toggle-thumb {
		transform: translateX(18px);
	}

	/* Restrictions */

	.restrictions-row {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.restrictions-display {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.restrictions-text {
		font-size: 0.82rem;
		color: var(--text-secondary);
		line-height: 1.5;
		flex: 1;
	}

	.restrictions-edit {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
	}

	.restrictions-textarea {
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 12px;
		color: var(--text-primary);
		font-size: 0.85rem;
		resize: vertical;
		line-height: 1.5;
		transition: border-color 0.2s;
	}

	.restrictions-textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.restrictions-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	/* Buttons */

	.btn-sm {
		font-size: 0.78rem;
		font-weight: 500;
		padding: 6px 14px;
		border-radius: 8px;
		border: none;
		transition: opacity 0.2s, background 0.2s;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.btn-sm.accent {
		background: var(--accent);
		color: var(--text-primary);
	}

	.btn-sm.accent:hover {
		opacity: 0.85;
	}

	.btn-sm.ghost {
		background: none;
		color: var(--text-secondary);
		border: 1px solid var(--border);
	}

	.btn-sm.ghost:hover {
		background: var(--bg-elevated);
	}

	/* Link row */

	.setting-link {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.85rem;
		color: var(--accent);
		text-decoration: none;
		font-weight: 500;
		transition: opacity 0.2s;
	}

	.setting-link:hover {
		opacity: 0.8;
	}

	/* About */

	.about-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
