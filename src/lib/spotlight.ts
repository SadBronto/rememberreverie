// "Show new photos right away": decides which slide plays next when a freshly taken
// photo is waiting to jump the queue. Pure (no React, no timers) so it can be tested.
//
// Behavior: a spotlighted photo plays right after the current slide. Once the queue is
// drained the show RESUMES from the slide it was heading to, so spotlights never reset
// or skip the normal rotation. The photo also keeps its normal chronological place in
// the list (at the end), so it plays again there like any other photo.
//
// With an empty queue and no pending resume this is EXACTLY the plain rotation
// ((cur + delta) mod total), so turning the feature off changes nothing.

export interface SpotlightState {
  queue: string[]          // photo ids waiting to jump the queue, oldest first
  resumeId: string | null  // slide to continue from after the spotlight(s) finish
}

export const EMPTY_SPOTLIGHT: SpotlightState = { queue: [], resumeId: null }

// A burst (e.g. a table of guests all shooting at once) must not hijack the show, so
// only a few jump the queue; the rest simply play in their normal place.
export const MAX_SPOTLIGHT_QUEUE = 5

export function enqueueSpotlight(queue: string[], ids: string[], max = MAX_SPOTLIGHT_QUEUE): string[] {
  const out = [...queue]
  for (const id of ids) {
    if (out.length >= max) break
    if (!out.includes(id)) out.push(id)
  }
  return out
}

// ids: the id of every slide in play order (photo slides use the photo's id).
export function pickNextSlide(
  ids: string[],
  cur: number,
  delta: number,
  st: SpotlightState,
): { next: number; state: SpotlightState } {
  const total = ids.length
  const natural = (((cur + delta) % total) + total) % total

  // Manual back/forward-by-more-than-one: plain movement, and abandon any resume.
  if (delta !== 1) return { next: natural, state: { queue: st.queue, resumeId: null } }

  let queue = st.queue
  let spot = -1
  while (queue.length > 0) {
    const id = queue[0]!
    queue = queue.slice(1)
    const i = ids.indexOf(id)
    if (i >= 0 && i !== cur) { spot = i; break }   // skip ids no longer in the list / already on screen
  }

  if (spot >= 0) {
    // Remember where the show was heading, unless we're already mid-spotlight or the
    // spotlight photo IS the natural next slide (then there's nothing to resume).
    const resumeId = st.resumeId ?? (spot !== natural ? ids[natural]! : null)
    return { next: spot, state: { queue, resumeId } }
  }

  if (st.resumeId !== null) {
    const i = ids.indexOf(st.resumeId)
    return { next: i >= 0 ? i : natural, state: { queue, resumeId: null } }
  }

  return { next: natural, state: { queue, resumeId: null } }
}
