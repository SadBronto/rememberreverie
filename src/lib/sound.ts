// Preload the shutter sound on module init.
// Drop a file at public/sounds/shutter.mp3 — if it's missing the play()
// promise rejects and we swallow it silently (no sound, no crash).
let audio: HTMLAudioElement | null = null

if (typeof window !== 'undefined') {
  audio = new Audio('/sounds/shutter.mp3')
  audio.preload = 'auto'
  audio.volume  = 0.7
}

export function playShutterSound() {
  if (!audio) return
  // Reset so rapid shots never queue — always plays from the top.
  audio.currentTime = 0
  audio.play().catch(() => {})
}
