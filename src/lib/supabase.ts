import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL  as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Client uses the anon key — safe to ship in the browser with RLS enabled.
// Only used for Storage uploads (photo blobs go directly to Supabase, bypassing
// Netlify Function size limits). All DB writes go through Netlify Functions
// which use the service key server-side.
export const supabase = (url && anon)
  ? createClient(url, anon)
  : null

export function storagePath(weddingId: string, sessionId: string, file: 'output' | 'annotation' | `source-${number}`): string {
  return `${weddingId}/${sessionId}/${file}.${file === 'annotation' ? 'png' : 'jpg'}`
}
