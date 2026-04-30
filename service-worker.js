const CACHE_NAME = 'star-editor-v4';
const APP_ASSETS = [
	'./',
	'./index.html',
	'./styles.css',
	'./manifest.webmanifest',
	'./catalog.bsc',
	'./icons/star-editor.svg',
	'./icons/star-editor-maskable.svg',
	'./icons/star-editor-192.png',
	'./icons/star-editor-512.png',
	'./icons/star-editor-maskable-192.png',
	'./icons/star-editor-maskable-512.png',
	'./icons/apple-touch-icon.png',
	'./js/app-canvas-interactions.js',
	'./js/app-editor-actions.js',
	'./js/app-runtime.js',
	'./js/app.js',
	'./js/camera.js',
	'./js/catalog-bsc.js',
	'./js/catalog-hyg.js',
	'./js/coords.js',
	'./js/picking.js',
	'./js/renderer-overlay.js',
	'./js/renderer-pipeline.js',
	'./js/renderer-star-buffer.js',
	'./js/renderer.js',
	'./js/sky.js',
	'./js/spectral.js',
	'./js/star-name.js',
	'./js/ui-sky-controls.js',
	'./js/ui-star-form.js',
	'./js/ui.js',
];


self.addEventListener('install', (event) =>
{
	event.waitUntil(precacheAssets());
});


self.addEventListener('activate', (event) =>
{
	event.waitUntil(cleanupCaches());
});


self.addEventListener('fetch', (event) =>
{
	const { request } = event;
	if (request.method !== 'GET')
	{
		return;
	}
	if (request.mode === 'navigate')
	{
		event.respondWith(respondToNavigation(request));
		return;
	}
	const requestUrl = new URL(request.url);
	if (requestUrl.origin !== self.location.origin)
	{
		return;
	}
	event.respondWith(respondToAssetRequest(request));
});


async function precacheAssets()
{
	const cache = await caches.open(CACHE_NAME);
	await cache.addAll(APP_ASSETS);
	await self.skipWaiting();
}


async function cleanupCaches()
{
	const cacheKeys = await caches.keys();
	await Promise.all(
		cacheKeys
			.filter((key) => key.startsWith('star-editor-') && key !== CACHE_NAME)
			.map((key) => caches.delete(key))
	);
	await self.clients.claim();
}


async function respondToNavigation(request)
{
	const cache = await caches.open(CACHE_NAME);
	try
	{
		const response = await fetch(request);
		if (response.ok)
		{
			await cache.put('./index.html', response.clone());
		}
		return response;
	}
	catch (error)
	{
		const cachedResponse = await cache.match('./index.html');
		if (cachedResponse)
		{
			return cachedResponse;
		}
		throw error;
	}
}


async function respondToAssetRequest(request)
{
	const cache = await caches.open(CACHE_NAME);
	const cachedResponse = await cache.match(request, { ignoreSearch: true });
	if (cachedResponse)
	{
		return cachedResponse;
	}
	const networkResponse = await fetch(request);
	if (networkResponse.ok)
	{
		await cache.put(request, networkResponse.clone());
	}
	return networkResponse;
}