import { create } from 'zustand'
import type { CaptureSession, WeddingConfig, CameraModeName } from '@/types/session'
import { uploadSession } from '@/lib/upload'
import { saveRecovery, removeRecovery } from '@/lib/recovery'

interface SessionState {
  weddingConfig: WeddingConfig | null
  activeSession: CaptureSession | null
  completedSessions: CaptureSession[]
  selectedMode: CameraModeName

  setWeddingConfig: (config: WeddingConfig) => void
  setSelectedMode: (mode: CameraModeName) => void
  beginSession: (weddingId: string, mode: CameraModeName) => CaptureSession
  setActiveSessionOutput: (outputImage: Blob, sourceImages: CaptureSession['sourceImages']) => void
  setAnnotation: (annotation: import('@/types/session').Annotation) => void
  finalizeSession: (session: CaptureSession) => Promise<void>
  clearActiveSession: () => void
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const useSessionStore = create<SessionState>((set) => ({
  weddingConfig: null,
  activeSession: null,
  completedSessions: [],
  selectedMode: 'disposable',

  setWeddingConfig: (config) => {
    set({ weddingConfig: config, selectedMode: config.allowedModes[0] ?? 'disposable' })
  },

  setSelectedMode: (mode) => set({ selectedMode: mode }),

  setActiveSessionOutput: (outputImage, sourceImages) => {
    set((state) =>
      state.activeSession
        ? { activeSession: { ...state.activeSession, outputImage, sourceImages } }
        : {}
    )
  },

  setAnnotation: (annotation) => {
    set((state) =>
      state.activeSession
        ? { activeSession: { ...state.activeSession, annotation } }
        : {}
    )
  },

  beginSession: (weddingId, mode) => {
    const session: CaptureSession = {
      id: generateId(),
      weddingId,
      mode,
      sourceImages: [],
      outputImage: null,
      annotation: null,
      capturedAt: new Date(),
      uploadStatus: 'idle',
      memoryNumber: null,
      retryCount: 0,
    }
    set({ activeSession: session })
    return session
  },

  finalizeSession: async (session) => {
    // Demo sessions (weddingId starts with 'demo-') skip the network upload
    // entirely — the gallery reads directly from completedSessions in the store.
    const isDemo = session.weddingId.startsWith('demo-')
    if (isDemo) {
      set((state) => ({
        // Only clear activeSession if it's still THIS session — prevents a race where a
        // slow upload from photo N wipes the activeSession that photo N+1 just created.
        activeSession: state.activeSession?.id === session.id ? null : state.activeSession,
        completedSessions: [...state.completedSessions, { ...session, uploadStatus: 'success' }],
      }))
      return
    }

    // Save a full recovery copy to IndexedDB BEFORE uploading. If the upload
    // fails (or the tab closes mid-upload), flushPendingUploads() re-sends it on
    // the next camera visit. Removed once the upload is confirmed.
    if (session.outputImage) {
      void saveRecovery({
        id:          session.id,
        weddingId:   session.weddingId,
        mode:        session.mode,
        capturedAt:  session.capturedAt.toISOString(),
        outputImage: session.outputImage,
        annotation:  session.annotation
          ? { type: session.annotation.type, dataUrl: session.annotation.dataUrl, appliedAt: session.annotation.appliedAt.toISOString() }
          : null,
        savedAt:     Date.now(),
      })
    }

    set((state) => ({
      activeSession: { ...session, uploadStatus: 'uploading' },
      completedSessions: [...state.completedSessions, { ...session, uploadStatus: 'uploading' }],
    }))

    const result = await uploadSession(session)

    const updatedSession: CaptureSession = {
      ...session,
      uploadStatus: result.success ? 'success' : 'failed',
      memoryNumber: result.memoryNumber ?? null,
      retryCount: result.retryCount,
    }

    // Remove the recovery copy only on confirmed success; otherwise it stays
    // queued for a later retry.
    if (result.success) void removeRecovery(session.id)

    set((state) => ({
      // Same race-condition guard as the demo path above
      activeSession: state.activeSession?.id === session.id ? null : state.activeSession,
      completedSessions: state.completedSessions.map((s) =>
        s.id === session.id ? updatedSession : s
      ),
    }))
  },

  clearActiveSession: () => set({ activeSession: null }),
}))
