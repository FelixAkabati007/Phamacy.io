export type OfflineMutation = { id: string; kind: 'checkout' | 'receive-batch' | 'expense'; payload: unknown; createdAt: number; status: 'pending' | 'syncing' | 'failed' }

const KEY = 'carepoint-offline-mutations'
const MAX_QUEUE_SIZE = 100

export function readOfflineQueue(): OfflineMutation[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is OfflineMutation => Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.kind === 'string' && typeof item.status === 'string')) : []
  } catch { return [] }
}

export function enqueueOfflineMutation(kind: OfflineMutation['kind'], payload: unknown) {
  const next: OfflineMutation = { id: crypto.randomUUID(), kind, payload, createdAt: Date.now(), status: 'pending' }
  const queue = [...readOfflineQueue(), next].slice(-MAX_QUEUE_SIZE)
  window.localStorage.setItem(KEY, JSON.stringify(queue))
  return next
}

export function removeOfflineMutation(id: string) {
  window.localStorage.setItem(KEY, JSON.stringify(readOfflineQueue().filter((item) => item.id !== id)))
}

export function updateOfflineMutation(id: string, status: OfflineMutation['status']) {
  window.localStorage.setItem(KEY, JSON.stringify(readOfflineQueue().map((item) => item.id === id ? { ...item, status } : item)))
}

export async function reconcileOfflineQueue(handlers: Partial<Record<OfflineMutation['kind'], (payload: unknown) => Promise<unknown>>>) {
  const pending = readOfflineQueue().filter((item) => item.status === 'pending' || item.status === 'failed')
  const results: Array<{ id: string; status: 'synced' | 'failed'; error?: string }> = []
  for (const mutation of pending) {
    const handler = handlers[mutation.kind]
    if (!handler) { updateOfflineMutation(mutation.id, 'failed'); results.push({ id: mutation.id, status: 'failed', error: `No handler for ${mutation.kind}` }); continue }
    updateOfflineMutation(mutation.id, 'syncing')
    try { await handler(mutation.payload); removeOfflineMutation(mutation.id); results.push({ id: mutation.id, status: 'synced' }) } catch (error) { updateOfflineMutation(mutation.id, 'failed'); results.push({ id: mutation.id, status: 'failed', error: error instanceof Error ? error.message : 'Sync failed' }) }
  }
  return results
}
