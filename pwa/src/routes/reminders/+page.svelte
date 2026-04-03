<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { Reminder } from '$lib/api';

	let reminders = $state<Reminder[]>([]);
	let loading = $state(true);

	// Add/edit form state
	let showForm = $state(false);
	let editingId = $state<string | null>(null);
	let form = $state({
		message: '',
		date: '',
		time: '',
		recurring_cron: '' as string,
	});
	let submitting = $state(false);

	const recurringOptions = [
		{ value: '', label: 'One-time' },
		{ value: '0 * * * *', label: 'Every hour' },
		{ value: '0 9 * * *', label: 'Every day at 9 AM' },
		{ value: '0 9 * * 1', label: 'Every Monday at 9 AM' },
		{ value: '0 9 1 * *', label: 'First of every month' },
	];

	const sorted = $derived(
		[...reminders]
			.filter((r) => r.status !== 'dismissed')
			.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()),
	);

	function formatDueDate(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const diffMs = d.getTime() - now.getTime();
		const diffMins = Math.round(diffMs / 60000);
		const diffHrs = Math.round(diffMs / 3600000);

		if (diffMins < 0) return 'Overdue';
		if (diffMins < 60) return `In ${diffMins}m`;
		if (diffHrs < 24) return `In ${diffHrs}h`;

		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	}

	function isOverdue(iso: string): boolean {
		return new Date(iso).getTime() < Date.now();
	}

	function formatRecurring(cron: string | null): string {
		if (!cron) return '';
		const match = recurringOptions.find((o) => o.value === cron);
		return match ? match.label : 'Recurring';
	}

	function openAddForm() {
		editingId = null;
		const now = new Date();
		now.setHours(now.getHours() + 1, 0, 0, 0);
		form = {
			message: '',
			date: now.toLocaleDateString('en-CA'),
			time: now.toTimeString().slice(0, 5),
			recurring_cron: '',
		};
		showForm = true;
	}

	function openEditForm(r: Reminder) {
		editingId = r.id;
		const d = new Date(r.due_at);
		form = {
			message: r.message,
			date: d.toLocaleDateString('en-CA'),
			time: d.toTimeString().slice(0, 5),
			recurring_cron: r.recurring_cron ?? '',
		};
		showForm = true;
	}

	async function submitForm() {
		if (submitting || !form.message.trim() || !form.date || !form.time) return;
		submitting = true;
		try {
			const due_at = new Date(`${form.date}T${form.time}`).toISOString();
			if (editingId) {
				await api.reminders.update(editingId, {
					message: form.message.trim(),
					due_at,
				});
			} else {
				const payload: { message: string; due_at: string; recurring_cron?: string } = {
					message: form.message.trim(),
					due_at,
				};
				if (form.recurring_cron) {
					payload.recurring_cron = form.recurring_cron;
				}
				await api.reminders.add(payload);
			}
			reminders = await api.reminders.list();
			showForm = false;
		} catch {
			// Submit failed
		} finally {
			submitting = false;
		}
	}

	async function deleteReminder(id: string) {
		try {
			await api.reminders.remove(id);
			reminders = reminders.filter((r) => r.id !== id);
		} catch {
			// Delete failed
		}
	}

	async function snooze(r: Reminder, minutes: number) {
		try {
			const newDue = new Date(Math.max(new Date(r.due_at).getTime(), Date.now()) + minutes * 60000);
			await api.reminders.update(r.id, { due_at: newDue.toISOString() });
			reminders = await api.reminders.list();
		} catch {
			// Snooze failed
		}
	}

	onMount(async () => {
		reminders = await api.reminders.list();
		loading = false;
	});
</script>

<svelte:head>
	<title>Reminders - LifeOS</title>
</svelte:head>

<div class="page">
	<h1>Reminders</h1>

	{#if loading}
		<div class="skeleton" style="height: 16px; width: 100px; border-radius: 4px; margin-bottom: 0.75rem;"></div>
		{#each Array(3) as _}
			<div class="skeleton-item">
				<div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
					<div class="skeleton" style="height: 14px; width: 65%; border-radius: 4px;"></div>
					<div class="skeleton" style="height: 10px; width: 40%; border-radius: 4px;"></div>
				</div>
				<div class="skeleton" style="width: 28px; height: 28px; border-radius: 50%;"></div>
			</div>
		{/each}
	{:else if sorted.length === 0 && !showForm}
		<div class="empty-state fade-in">
			<p>No reminders set.</p>
			<p class="empty-hint">Tap + to add one.</p>
		</div>
	{:else}
		<div class="reminder-list fade-in">
			{#each sorted as r (r.id)}
				<div class="reminder-card" class:overdue={isOverdue(r.due_at)}>
					<button class="reminder-body" onclick={() => openEditForm(r)}>
						<span class="reminder-msg">{r.message}</span>
						<div class="reminder-meta">
							<span class="reminder-due" class:overdue-text={isOverdue(r.due_at)}>
								{formatDueDate(r.due_at)}
							</span>
							{#if r.recurring_cron}
								<span class="recurring-badge">{formatRecurring(r.recurring_cron)}</span>
							{/if}
						</div>
					</button>
					<div class="reminder-actions">
						<div class="snooze-row">
							<button class="snooze-btn" onclick={() => snooze(r, 60)} title="Snooze 1 hour">+1h</button>
							<button class="snooze-btn" onclick={() => snooze(r, 1440)} title="Snooze until tomorrow">+1d</button>
							<button class="snooze-btn" onclick={() => snooze(r, 10080)} title="Snooze 1 week">+1w</button>
						</div>
						<button
							class="delete-btn"
							onclick={() => deleteReminder(r.id)}
							title="Delete reminder"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Add/Edit Form Overlay -->
	{#if showForm}
		<div class="form-overlay fade-in" role="dialog">
			<div class="form-card">
				<div class="form-header">
					<h3>{editingId ? 'Edit Reminder' : 'New Reminder'}</h3>
					<button class="form-close" onclick={() => (showForm = false)} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<form onsubmit={(e) => { e.preventDefault(); submitForm(); }}>
					<label class="form-field">
						<span>Message</span>
						<input type="text" bind:value={form.message} placeholder="e.g. Take out trash" required />
					</label>
					<div class="form-row">
						<label class="form-field">
							<span>Date</span>
							<input type="date" bind:value={form.date} required />
						</label>
						<label class="form-field">
							<span>Time</span>
							<input type="time" bind:value={form.time} required />
						</label>
					</div>
					{#if !editingId}
						<label class="form-field">
							<span>Recurring</span>
							<select bind:value={form.recurring_cron}>
								{#each recurringOptions as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</label>
					{/if}
					<button type="submit" class="form-submit" disabled={submitting}>
						{submitting ? 'Saving...' : editingId ? 'Update' : 'Add Reminder'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- FAB "+" -->
	<button class="fab" onclick={openAddForm} aria-label="Add reminder">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	</button>
</div>

<style>
	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 1.25rem;
	}

	.reminder-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.reminder-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		transition: border-color 0.2s;
	}

	.reminder-card.overdue {
		border-color: var(--danger);
	}

	.reminder-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: none;
		border: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
		padding: 0;
	}

	.reminder-msg {
		font-size: 0.95rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.reminder-meta {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.reminder-due.overdue-text {
		color: var(--danger);
		font-weight: 600;
	}

	.recurring-badge {
		background: var(--accent-glow);
		color: var(--accent);
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 500;
	}

	.reminder-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: 12px;
		flex-shrink: 0;
	}

	.snooze-row {
		display: flex;
		gap: 4px;
	}

	.snooze-btn {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 3px 6px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.2s;
	}

	.snooze-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.delete-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: none;
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-secondary);
		transition: color 0.2s, border-color 0.2s;
		flex-shrink: 0;
	}

	.delete-btn:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	.delete-btn svg {
		width: 14px;
		height: 14px;
	}

	/* Form overlay */
	.form-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 100;
		padding: 0 0 env(safe-area-inset-bottom, 0);
	}

	.form-card {
		background: var(--bg-card);
		border-radius: 16px 16px 0 0;
		padding: 20px 20px 80px;
		width: 100%;
		max-width: 500px;
		max-height: 80vh;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-bottom: none;
	}

	.form-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.form-header h3 {
		font-size: 1.1rem;
		font-weight: 600;
	}

	.form-close {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-secondary);
	}

	.form-close svg {
		width: 16px;
		height: 16px;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
		flex: 1;
	}

	.form-field span {
		font-size: 0.75rem;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.form-field input,
	.form-field select {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 12px;
		color: var(--text-primary);
		font-size: 0.9rem;
	}

	.form-field input:focus,
	.form-field select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.form-row {
		display: flex;
		gap: 10px;
	}

	.form-submit {
		width: 100%;
		background: var(--accent);
		color: white;
		border: none;
		border-radius: 10px;
		padding: 12px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		margin-top: 4px;
		transition: opacity 0.2s;
	}

	.form-submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-submit:hover:not(:disabled) {
		opacity: 0.9;
	}

	/* FAB */
	.fab {
		position: fixed;
		bottom: 72px;
		right: 20px;
		width: 52px;
		height: 52px;
		background: var(--accent);
		border-radius: 16px;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
		transition: transform 0.2s;
		z-index: 50;
	}

	.fab:hover {
		transform: scale(1.05);
	}

	.fab svg {
		width: 22px;
		height: 22px;
		color: white;
	}

	.skeleton-item {
		display: flex;
		align-items: center;
		background: var(--bg-card);
		border-radius: 12px;
		padding: 14px;
		border: 1px solid var(--border);
		margin-bottom: 8px;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--text-secondary);
	}

	.empty-hint {
		font-size: 0.85rem;
		margin-top: 0.5rem;
		opacity: 0.7;
	}
</style>
