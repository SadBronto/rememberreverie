import { create } from 'zustand'
import type { CameraModeName, WeddingConfig } from '@/types/session'
import { DEMO_BASE_CONFIG } from '@/demo/demoConfig'

export interface DemoSetup {
  coupleNames: string
  weddingDate: string       // ISO date string e.g. "2026-09-20"
  selectedModes: CameraModeName[]
}

interface DemoState {
  // ── Legacy demo (original guided flow) ──
  setup: DemoSetup | null
  photosTaken: number
  currentPromptIndex: number

  setSetup: (setup: DemoSetup) => void
  incrementPhotoCount: () => void
  advancePrompt: () => void
  reset: () => void

  // ── New persona shell (Guest / Client / Setup) ──
  // `active` gates the persistent bottom menu; `config` is the demo wedding
  // config, mutated by the Setup persona so a prospect's choices flow into the
  // Guest flow and Client gallery. Resets on reload — every prospect starts clean.
  active: boolean
  config: WeddingConfig

  enter: () => void
  exit: () => void
  applySetup: (overrides: Partial<WeddingConfig>) => void
  resetConfig: () => void

  // First-time-per-session intro splash. Each persona shows its splash only the
  // first time it's opened this session; the global DemoSplash renders it and
  // navigates to `path` when the prospect taps Continue.
  splashSeen: Record<DemoPersona, boolean>
  pendingSplash: { persona: DemoPersona; path: string } | null
  requestSplash: (persona: DemoPersona, path: string) => void
  clearSplash: () => void
}

export type DemoPersona = 'guest' | 'client' | 'setup'

const NO_SPLASH_SEEN: Record<DemoPersona, boolean> = { guest: false, client: false, setup: false }

export const useDemoStore = create<DemoState>((set) => ({
  setup: null,
  photosTaken: 0,
  currentPromptIndex: 0,

  setSetup: (setup) => set({ setup, photosTaken: 0, currentPromptIndex: 0 }),
  incrementPhotoCount: () => set((s) => ({ photosTaken: s.photosTaken + 1 })),
  advancePrompt: () => set((s) => ({ currentPromptIndex: s.currentPromptIndex + 1 })),
  reset: () => set({ setup: null, photosTaken: 0, currentPromptIndex: 0 }),

  active: false,
  config: DEMO_BASE_CONFIG,

  enter: () => set({ active: true }),
  exit: () => set({ active: false, config: DEMO_BASE_CONFIG, pendingSplash: null, splashSeen: NO_SPLASH_SEEN }),
  applySetup: (overrides) =>
    set((s) => ({ config: { ...s.config, ...overrides, id: s.config.id } })),
  resetConfig: () => set({ config: DEMO_BASE_CONFIG }),

  splashSeen: NO_SPLASH_SEEN,
  pendingSplash: null,
  requestSplash: (persona, path) =>
    set((s) => ({ pendingSplash: { persona, path }, splashSeen: { ...s.splashSeen, [persona]: true } })),
  clearSplash: () => set({ pendingSplash: null }),
}))

export const DEMO_PHOTO_CAP = 5

export const DEMO_PROMPTS = [
  'Capture a toast.',
  'Capture something romantic.',
  'Capture a candid moment.',
  'Capture a dance-floor memory.',
  'Capture something silly.',
]
