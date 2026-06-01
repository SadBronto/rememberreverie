import { create } from 'zustand'
import type { CameraModeName } from '@/types/session'

export interface DemoSetup {
  coupleNames: string
  weddingDate: string       // ISO date string e.g. "2026-09-20"
  selectedModes: CameraModeName[]
}

interface DemoState {
  setup: DemoSetup | null
  photosTaken: number
  currentPromptIndex: number

  setSetup: (setup: DemoSetup) => void
  incrementPhotoCount: () => void
  advancePrompt: () => void
  reset: () => void
}

export const useDemoStore = create<DemoState>((set) => ({
  setup: null,
  photosTaken: 0,
  currentPromptIndex: 0,

  setSetup: (setup) => set({ setup, photosTaken: 0, currentPromptIndex: 0 }),
  incrementPhotoCount: () => set((s) => ({ photosTaken: s.photosTaken + 1 })),
  advancePrompt: () => set((s) => ({ currentPromptIndex: s.currentPromptIndex + 1 })),
  reset: () => set({ setup: null, photosTaken: 0, currentPromptIndex: 0 }),
}))

export const DEMO_PHOTO_CAP = 5

export const DEMO_PROMPTS = [
  'Capture a toast.',
  'Capture something romantic.',
  'Capture a candid moment.',
  'Capture a dance-floor memory.',
  'Capture something silly.',
]
