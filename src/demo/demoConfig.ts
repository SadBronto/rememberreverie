import type { WeddingConfig } from '@/types/session'

// The demo runs as a "wedding" whose id starts with `demo-`. That prefix is the
// single seam the rest of the app already keys off (see sessionStore.finalizeSession
// — demo sessions skip the network upload). Keeping the prefix means the real
// guest/couple/slideshow screens work in the demo without a parallel code path.
export const DEMO_WEDDING_ID = 'demo-reverie'

export function isDemoId(id: string | undefined | null): boolean {
  return !!id && id.startsWith('demo-')
}

// Base config the demo starts from. The Setup persona produces overrides that are
// merged over this (see demoStore.applySetup) so a prospect sees their own choices
// reflected in the Guest flow and Client gallery.
export const DEMO_BASE_CONFIG: WeddingConfig = {
  id: DEMO_WEDDING_ID,
  coupleNames: 'Avery & Jordan',
  weddingDate: '2026-09-19',
  isEvent: false,
  welcomeMessage: 'Leave us a memory.',
  allowedModes: ['disposable', 'polaroid', 'super8'],
  preferredOrientation: 'any',
  annotationMode: 'signature',
  slideshowEnabled: true,
  timestampEnabled: true,
  timestampStyle: 'classic',
  isDemoMode: true,
}
