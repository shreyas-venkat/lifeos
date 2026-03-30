/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { build, files, version } from '$service-worker';

const CACHE = `lifeos-${version}`;
const ASSETS = [...build, ...files];

// Install: cache all static assets
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => self.skipWaiting())
	);
});

// Activate: purge old caches
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
	);
});

// Push notification handler
self.addEventListener('push', (event) => {
	const data = event.data?.json() ?? { title: 'LifeOS', body: 'New notification' };
	event.waitUntil(
		self.registration.showNotification(data.title, {
			body: data.body,
			icon: '/app/icon-192.png',
			badge: '/app/icon-192.png',
			tag: data.tag || 'lifeos-notification',
			data: data.url ? { url: data.url } : undefined,
		})
	);
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = event.notification.data?.url || '/app';
	event.waitUntil(
		clients.matchAll({ type: 'window' }).then((windowClients) => {
			for (const client of windowClients) {
				if (client.url.includes('/app') && 'focus' in client) return client.focus();
			}
			return clients.openWindow(url);
		})
	);
});

// Fetch: network-first for API, stale-while-revalidate for assets
self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// API calls: network-first, fall back to cache
	if (url.pathname.startsWith('/api')) {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					const clone = response.clone();
					caches.open(CACHE).then((cache) => cache.put(event.request, clone));
					return response;
				})
				.catch(() => caches.match(event.request).then((cached) => cached || new Response('{}', { status: 503 })))
		);
		return;
	}

	// Static assets: stale-while-revalidate
	event.respondWith(
		caches.match(event.request).then((cached) => {
			const fetched = fetch(event.request).then((response) => {
				const clone = response.clone();
				caches.open(CACHE).then((cache) => cache.put(event.request, clone));
				return response;
			});
			return cached || fetched;
		})
	);
});
