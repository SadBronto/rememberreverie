import type { CaptureSession, CameraModeName } from '@/types/session'
import { uploadSession } from '@/lib/upload'

// Local recovery queue for photos that haven't successfully uploaded yet.
//
// Why IndexedDB and not localStorage: a processed photo is a ~1.5–3 MB JPEG.
// localStorage only stores strings (base64 inflates that ~33%) and caps at
// ~5 MB, so it can't safely hold more than one pending photo. IndexedDB stores
// the Blob natively with a far larger quota, so a guest can lose connectivity,
// take several photos, and have them all flushed when the connection returns.

const DB_NAME = 'reverie'
const STORE   = 'pending-uploads'

export interface PendingUpload {
  id:          string
  weddingId:   string
  mode:        CameraModeName
  capturedAt:  string                       // ISO
  outputImage: Blob
  annotation:  { type: 'signature' | 'doodle'; dataUrl: string; appliedAt: string } | null
  savedAt:     number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function saveRecovery(rec: PendingUpload): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(rec)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
    db.close()
  } catch {
    // IndexedDB unavailable (private mode, etc.) — recovery is best-effort.
  }
}

export async function removeRecovery(id: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
    })
    db.close()
  } catch { /* ignore */ }
}

export async function getAllRecovery(): Promise<PendingUpload[]> {
  try {
    const db = await openDB()
    const all = await new Promise<PendingUpload[]>((resolve) => {
      const tx  = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => resolve((req.result as PendingUpload[]) ?? [])
      req.onerror   = () => resolve([])
    })
    db.close()
    return all
  } catch {
    return []
  }
}

export async function countRecovery(): Promise<number> {
  return (await getAllRecovery()).length
}

let flushing = false

// Re-attempt every pending upload. Successful ones are removed from the queue.
// Safe to call repeatedly (guards against concurrent runs) and idempotent on the
// server: /api/sessions handles a duplicate session id by re-issuing upload URLs.
export async function flushPendingUploads(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) return { flushed: 0, remaining: -1 }
  flushing = true
  try {
    const pending = await getAllRecovery()
    let flushed = 0

    for (const rec of pending) {
      const session: CaptureSession = {
        id:           rec.id,
        weddingId:    rec.weddingId,
        mode:         rec.mode,
        sourceImages: [],
        outputImage:  rec.outputImage,
        annotation:   rec.annotation
          ? { type: rec.annotation.type, dataUrl: rec.annotation.dataUrl, appliedAt: new Date(rec.annotation.appliedAt) }
          : null,
        capturedAt:   new Date(rec.capturedAt),
        uploadStatus: 'pending',
        memoryNumber: null,
        retryCount:   0,
      }

      const result = await uploadSession(session)
      if (result.success) {
        await removeRecovery(rec.id)
        flushed++
      }
    }

    const remaining = (await getAllRecovery()).length
    return { flushed, remaining }
  } finally {
    flushing = false
  }
}
