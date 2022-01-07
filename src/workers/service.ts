import { manifest, version } from '@parcel/service-worker';

declare const self: ServiceWorkerGlobalScope;

async function install() {
  const cache = await caches.open(version);
  await cache.addAll(manifest);
}

self.addEventListener('install', e => e.waitUntil(install()));

async function activate() {
  const keys = await caches.keys();
  await Promise.all(
    keys.map(key => key !== version && caches.delete(key))
  );
}

self.addEventListener('activate', e => e.waitUntil(activate()));

async function respond(req: Request) {
  const cache = await caches.open(version);
  try {
    const res = await fetch(req);
    cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req))!;
  }
}

self.addEventListener('fetch', evt => {
  evt.respondWith(respond(evt.request));
});