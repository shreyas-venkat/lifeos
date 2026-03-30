import { api } from './api';
import type { Notification as AppNotification } from './api';

let pollTimer: ReturnType<typeof setInterval> | undefined;
let unseenCountCallback: ((count: number) => void) | undefined;

const POLL_INTERVAL_MS = 60_000;

export function onUnseenCountChange(cb: (count: number) => void): void {
  unseenCountCallback = cb;
}

async function pollOnce(): Promise<void> {
  const pending = await api.notifications.pending();
  if (unseenCountCallback) {
    unseenCountCallback(pending.length);
  }

  if (pending.length === 0) return;

  // Show browser notifications if permission is granted
  if ('Notification' in window && Notification.permission === 'granted') {
    for (const n of pending) {
      new Notification(n.title, {
        body: n.body,
        tag: `lifeos-${n.id}`,
        icon: '/app/icon-192.png',
      });
    }
  }

  // Mark all as seen
  const ids = pending.map((n: AppNotification) => n.id);
  await api.notifications.markSeen(ids);

  // Update count to 0 after marking seen
  if (unseenCountCallback) {
    unseenCountCallback(0);
  }
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function startPolling(): void {
  if (pollTimer) return;
  // Initial poll immediately
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
