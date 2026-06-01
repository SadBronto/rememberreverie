import type { CameraModeName } from '@/types/session'

export interface CameraModeConfig {
  name: CameraModeName
  label: string
  captureCount: number          // 1 for all current modes; 4 for future Photo Booth
  aspectRatio: number           // width / height
  orientation: 'landscape' | 'portrait'
  filter: FilterConfig
  frame: FrameConfig
}

export interface FilterConfig {
  // All values are multipliers or offsets applied via Canvas 2D / CSS filters
  warmth: number           // 0–1: how much warm (amber) overlay to blend
  grain: number            // 0–1: grain intensity
  vignette: number         // 0–1: vignette strength
  brightness: number       // CSS filter value e.g. 1.05
  contrast: number         // CSS filter value e.g. 0.95
  saturation: number       // CSS filter value e.g. 0.9
  liftedBlacks: number     // 0–1: how much to lift shadow floor (matte look)
  softness: number         // 0–1: subtle gaussian blur strength
}

export interface FrameConfig {
  borderTop: number        // fraction of image height (0 = no border)
  borderBottom: number
  borderLeft: number
  borderRight: number
  borderColor: string      // hex
  showTimestamp: boolean
  timestampPosition: 'bottom-right' | 'bottom-left'
}

export const CAMERA_MODES: Record<CameraModeName, CameraModeConfig> = {
  disposable: {
    name: 'disposable',
    label: 'Disposable Camera',
    captureCount: 1,
    aspectRatio: 3 / 2,
    orientation: 'landscape',
    filter: {
      // Flash-heavy, candid, punchy — "I was there"
      warmth:       0.04,   // near-neutral; flash kills warm ambient light
      grain:        0.26,   // high ISO noise from pushing cheap film
      vignette:     0.18,   // flash floods the frame; minimal corner darkening
      brightness:   1.08,   // slight overexposure from direct flash
      contrast:     1.10,   // punchy flash shadows and highlights
      saturation:   0.95,   // flash pops colours slightly
      liftedBlacks: 0.03,   // flash creates deep blacks, not matte
      softness:     0.12,   // sharp — flash freezes motion
    },
    frame: {
      borderTop: 0,
      borderBottom: 0,
      borderLeft: 0,
      borderRight: 0,
      borderColor: '#ffffff',
      showTimestamp: true,
      timestampPosition: 'bottom-right',
    },
  },

  polaroid: {
    name: 'polaroid',
    label: 'Polaroid',
    captureCount: 1,
    aspectRatio: 1 / 1,    // square image area (real Polaroid is ~3:3 image)
    orientation: 'portrait',
    filter: {
      warmth: 0.1,
      grain: 0.12,
      vignette: 0.25,
      brightness: 1.04,
      contrast: 0.93,
      saturation: 0.85,
      liftedBlacks: 0.1,
      softness: 0.6,
    },
    frame: {
      borderTop: 0.055,
      borderBottom: 0.28,   // thick lower white border for signing
      borderLeft: 0.055,
      borderRight: 0.055,
      borderColor: '#faf8f4',
      showTimestamp: false,
      timestampPosition: 'bottom-right',
    },
  },

  super8: {
    name: 'super8',
    label: 'Super 8',
    captureCount: 1,
    aspectRatio: 4 / 3,    // actual Super 8 film frame (5.79mm × 4.22mm ≈ 1.37:1, ~4:3)
    orientation: 'landscape',
    filter: {
      // Cinematic, dreamy, romantic — "I remember this"
      warmth:       0.24,   // deep golden-amber film warmth; almost halation glow
      grain:        0.10,   // film texture — softer pattern than high-ISO noise
      vignette:     0.52,   // heavy cinematic framing; draws eye to centre
      brightness:   0.95,   // slightly underexposed; moody, atmospheric
      contrast:     0.86,   // soft tonal roll-off, no harsh clipping
      saturation:   0.68,   // muted, faded film palette; nothing screams
      liftedBlacks: 0.18,   // significant matte/halation lift in shadows
      softness:     0.85,   // optical bloom — film lens glow, motion softness
    },
    frame: {
      borderTop: 0,
      borderBottom: 0,
      borderLeft: 0,
      borderRight: 0,
      borderColor: '#ffffff',
      showTimestamp: true,
      timestampPosition: 'bottom-right',
    },
  },
}
