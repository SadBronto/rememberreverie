// A CaptureSession is the atomic unit of the system.
// Single-shot modes (Disposable, Polaroid, Super8) have captureCount=1.
// Photo Booth will have captureCount=4 with sourceImages[].
// Never assume sourceImages.length === 1 elsewhere in the codebase.

export type CameraModeName = 'disposable' | 'polaroid' | 'super8'

export type UploadStatus = 'idle' | 'pending' | 'uploading' | 'success' | 'failed'

export interface SourceImage {
  blob: Blob
  capturedAt: Date
  index: number          // position in session (0 for single-shot, 0-3 for strip)
}

export interface Annotation {
  type: 'signature' | 'doodle'
  dataUrl: string        // PNG data URL of the annotation layer
  appliedAt: Date
}

export interface CaptureSession {
  id: string
  weddingId: string
  mode: CameraModeName
  sourceImages: SourceImage[]      // one per capture (1 for now, 4 for future strip)
  outputImage: Blob | null         // processed composite (filters applied, images merged)
  annotation: Annotation | null    // stored separately — never baked into outputImage
  capturedAt: Date
  uploadStatus: UploadStatus
  memoryNumber: number | null      // assigned by server after successful upload
  retryCount: number
}

export interface WeddingConfig {
  id: string
  coupleNames: string
  weddingDate: string | null       // ISO date string; null for events with no set date
  isEvent?: boolean
  welcomeMessage: string
  // Couple controls which memory styles guests can use.
  // Single entry = no selector shown to guests.
  // Multiple entries = guests see a style picker (couple's choice to allow this).
  allowedModes: CameraModeName[]
  preferredOrientation: 'landscape' | 'portrait' | 'any'
  annotationMode: 'disabled' | 'signature' | 'doodle'
  slideshowEnabled: boolean
  timestampEnabled: boolean
  // Layout styles (not color — each style has its own position, font size, and colour)
  // classic:  bottom-right, two lines, orange — date + time
  // vertical: bottom-left, rotated 90°, warm amber — date only
  // elegant:  top-left, small, off-white — couple name + date
  timestampStyle: 'classic' | 'vertical' | 'elegant'
  themeColor?: string
  heroImageUrl?: string
  // Demo mode: enables photo cap, guided prompts, seeded gallery
  isDemoMode?: boolean
  photoCap?: number               // max captures; undefined = unlimited
  // Location fence (admin-set). When enabled, guests must be within radius of
  // the venue to open the camera. The bypass code is verified server-side and is
  // never included here. Distance is checked in the browser; location isn't stored.
  geofenceEnabled?: boolean
  geofenceLat?: number | null
  geofenceLng?: number | null
  geofenceRadiusM?: number | null
  geofenceHasBypass?: boolean      // whether a bypass code exists (code itself stays server-side)
}
