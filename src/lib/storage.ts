import type { ConversationRecord } from '@/types'

// Keep in sync with public/sw.js, which writes to the same share-inbox store.
const DB_NAME = 'unread'
const DB_VERSION = 1
const CONVERSATIONS = 'conversations'
const SHARE_INBOX = 'share-inbox'

export type SharedItem = { id?: number; kind: 'file' | 'text'; name: string; type: string; blob?: Blob; text?: string; receivedAt: number }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CONVERSATIONS)) db.createObjectStore(CONVERSATIONS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SHARE_INBOX)) db.createObjectStore(SHARE_INBOX, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close()
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req ? req.result : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export type ConversationRepository = {
  persistent: boolean
  close(): void
  list(): Promise<ConversationRecord[]>
  put(record: ConversationRecord): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

function migrate(raw: unknown): ConversationRecord | null {
  const r = raw as Partial<ConversationRecord> | null
  if (!r || r.schemaVersion !== 1 || !Array.isArray(r.messages)) return null
  return r as ConversationRecord
}

function memoryRepository(): ConversationRepository {
  const items = new Map<string, ConversationRecord>()
  return {
    persistent: false,
    close: () => undefined,
    list: async () => [...items.values()].sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
    put: async (r) => void items.set(r.id, r),
    remove: async (id) => void items.delete(id),
    clear: async () => items.clear(),
  }
}

export async function createRepository(): Promise<ConversationRepository> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return memoryRepository()
  }
  return {
    persistent: true,
    close: () => db.close(),
    async list() {
      const all = ((await tx<unknown[]>(db, CONVERSATIONS, 'readonly', (s) => s.getAll())) ?? []).map(migrate).filter(Boolean) as ConversationRecord[]
      return all.sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    },
    put: async (r) => void (await tx(db, CONVERSATIONS, 'readwrite', (s) => s.put(r))),
    remove: async (id) => void (await tx(db, CONVERSATIONS, 'readwrite', (s) => s.delete(id))),
    clear: async () => void (await tx(db, CONVERSATIONS, 'readwrite', (s) => s.clear())),
  }
}

/** Reads and clears everything the service worker received via Share to Unread. */
export async function consumeShareInbox(): Promise<SharedItem[]> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return []
  }
  try {
    // Read and clear atomically so a concurrent share isn't erased between transactions.
    const items = (await tx<SharedItem[]>(db, SHARE_INBOX, 'readwrite', (store) => {
      const request = store.getAll()
      store.clear()
      return request
    })) ?? []
    return items.sort((a, b) => a.receivedAt - b.receivedAt)
  } finally {
    db.close()
  }
}

export function sharedItemToFile(item: SharedItem): File | null {
  if (item.kind === 'file' && item.blob) return new File([item.blob], item.name || 'shared', { type: item.type || item.blob.type })
  if (item.kind === 'text' && item.text) return new File([item.text], 'shared-text.txt', { type: 'text/plain' })
  return null
}
