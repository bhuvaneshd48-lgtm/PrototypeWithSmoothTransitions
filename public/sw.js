// Unread service worker: receives Share to Unread and caches only the app shell.
// Shared content is stored locally and never sent anywhere automatically.
const SHELL_CACHE = 'unread-shell-v1'
const DB_NAME = 'unread'
const DB_VERSION = 1
const scopeUrl = new URL(self.registration.scope)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll([scopeUrl.href])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    // Keep in sync with src/lib/storage.ts
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('conversations')) db.createObjectStore('conversations', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('share-inbox')) db.createObjectStore('share-inbox', { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function storeShare(request) {
  const form = await request.formData()
  const items = []
  const now = Date.now()
  for (const file of form.getAll('files')) {
    if (file && typeof file === 'object' && file.size) items.push({ kind: 'file', name: file.name, type: file.type, blob: file, receivedAt: now })
  }
  const text = [form.get('title'), form.get('text')].filter((v) => typeof v === 'string' && v.trim()).join('\n')
  if (!items.length && text) items.push({ kind: 'text', name: 'shared-text.txt', type: 'text/plain', text, receivedAt: now })
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction('share-inbox', 'readwrite')
    const store = tx.objectStore('share-inbox')
    store.clear()
    items.forEach((i) => store.add(i))
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(
      storeShare(event.request)
        .catch(() => undefined)
        .then(() => Response.redirect(new URL('./?shared=1', scopeUrl).href, 303)),
    )
    return
  }
  // App shell only: navigations fall back to the cached shell when offline. API calls are never cached.
  if (event.request.method === 'GET' && event.request.mode === 'navigate' && url.origin === scopeUrl.origin) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone()
          if (res.ok) caches.open(SHELL_CACHE).then((c) => c.put(scopeUrl.href, copy))
          return res
        })
        .catch(() => caches.match(scopeUrl.href)),
    )
  }
})
