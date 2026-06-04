import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/sessions
// Creates a session record and returns a signed upload URL for the photo blob.
// The client uploads the photo directly to Supabase Storage (no size limits).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let body: {
    sessionId: string
    weddingId: string
    mode: string
    capturedAt: string
    hasAnnotation: boolean
  }

  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const { sessionId, weddingId, mode, capturedAt, hasAnnotation } = body

  if (!sessionId || !weddingId || !mode) {
    return { statusCode: 400, body: 'Missing required fields' }
  }

  // Insert session — memory_number assigned by DB trigger.
  // A recovered/retried upload re-sends the same sessionId; treat a duplicate as
  // success and re-issue the upload URLs so the photo can still finish uploading.
  let memoryNumber: number | null = null
  const { data: session, error: dbError } = await supabase
    .from('sessions')
    .insert({
      id:          sessionId,
      wedding_id:  weddingId,
      mode,
      captured_at: capturedAt,
      output_path: `${weddingId}/${sessionId}/output.jpg`,
      annotation_path: hasAnnotation ? `${weddingId}/${sessionId}/annotation.png` : null,
    })
    .select('memory_number')
    .single()

  if (dbError) {
    if (dbError.code === '23505') {
      // Already registered on a previous attempt — fetch its existing number.
      const { data: existing } = await supabase
        .from('sessions')
        .select('memory_number')
        .eq('id', sessionId)
        .single()
      memoryNumber = existing?.memory_number ?? null
    } else {
      console.error('DB insert error:', dbError)
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create session' }) }
    }
  } else {
    memoryNumber = session.memory_number
  }

  // Rolling deletion: if this wedding has a photo_cap, check whether we're over it
  // and delete the oldest session(s) to make room. Oldest = lowest captured_at.
  const { data: wedding } = await supabase
    .from('weddings')
    .select('photo_cap')
    .eq('id', weddingId)
    .single()

  if (wedding?.photo_cap) {
    const { count } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('wedding_id', weddingId)
      .neq('status', 'deleted')

    const over = (count ?? 0) - wedding.photo_cap
    if (over > 0) {
      // Find the oldest `over` sessions (excluding the one just created)
      const { data: oldest } = await supabase
        .from('sessions')
        .select('id, output_path, annotation_path')
        .eq('wedding_id', weddingId)
        .neq('status', 'deleted')
        .neq('id', sessionId)
        .order('captured_at', { ascending: true })
        .limit(over)

      for (const old of oldest ?? []) {
        const paths = [old.output_path, old.annotation_path].filter(Boolean) as string[]
        if (paths.length) await supabase.storage.from('photos').remove(paths)
        await supabase.from('sessions').update({ status: 'deleted' }).eq('id', old.id)
      }
    }
  }

  // Create signed upload URL — client will PUT the photo blob here directly
  const outputPath = `${weddingId}/${sessionId}/output.jpg`
  const { data: signedData, error: signedError } = await supabase.storage
    .from('photos')
    .createSignedUploadUrl(outputPath)

  if (signedError || !signedData) {
    console.error('Signed URL error:', signedError)
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create upload URL' }) }
  }

  // If there's an annotation, create a second signed URL for it
  let annotationUploadUrl: string | undefined
  if (hasAnnotation) {
    const annotPath = `${weddingId}/${sessionId}/annotation.png`
    const { data: annotData } = await supabase.storage
      .from('photos')
      .createSignedUploadUrl(annotPath)
    annotationUploadUrl = annotData?.signedUrl
  }

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      memoryNumber,
      uploadUrl:           signedData.signedUrl,
      annotationUploadUrl: annotationUploadUrl ?? null,
    }),
  }
}
