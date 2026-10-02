import { supabase } from './supabase'

// "Refresh now" nudge for a live slideshow. When staff or the host removes a photo,
// we broadcast on a per-event Realtime channel so the running slideshow (the TV in
// the venue) re-fetches within ~1s instead of waiting for its poll (up to 5 min on a
// lobby display). The SlideshowPage subscribes to the same channel.
//
// Fire-and-forget and defensive: if Realtime/Supabase isn't available, it's a no-op
// and the slideshow's own poll remains the fallback — nothing breaks.

export function slideshowChannel(weddingId: string) {
  return `slideshow:${weddingId}`
}

export function pokeSlideshow(weddingId: string | undefined | null) {
  if (!supabase || !weddingId) return
  try {
    const ch = supabase.channel(slideshowChannel(weddingId))
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Receivers (the slideshow) get this; the sender does not need to.
        void ch.send({ type: 'broadcast', event: 'refresh', payload: { at: Date.now() } })
        // Give the message a moment to flush, then drop the channel.
        setTimeout(() => { try { supabase?.removeChannel(ch) } catch { /* noop */ } }, 1500)
      }
    })
  } catch {
    /* realtime unavailable — the slideshow poll will catch up */
  }
}
