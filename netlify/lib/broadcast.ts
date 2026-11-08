// Server-side "refresh now" nudge for a live slideshow, over Supabase Realtime's REST
// broadcast endpoint (no websocket needed from a serverless function). The slideshow
// subscribes to the same per-event channel name (see src/lib/liveRefresh.ts).
//
// Best-effort by design: a failure here must never affect the upload or moderation
// that triggered it, and the slideshow's own poll remains the fallback.

export async function broadcastSlideshow(
  weddingId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ topic: `slideshow:${weddingId}`, event: 'refresh', payload, private: false }],
      }),
    })
  } catch {
    /* realtime unavailable - the slideshow poll will catch up */
  }
}
