import { NextResponse } from 'next/server'
import { getJobMedia } from '@/lib/avatar-jobs'

export const runtime = 'nodejs'
export const maxDuration = 120

const BASE_URL = 'https://api.bey.dev/v1'
const CHUNK_SIZE = 16 * 1024 * 1024 // 16 MB

function beyHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = process.env.BEY_API_KEY
  if (!key) throw new Error('BEY_API_KEY not configured')
  return { 'x-api-key': key, ...extra }
}

export async function POST(req: Request) {
  const { jobId, avatarName } = await req.json()
  if (!jobId || !avatarName) {
    return NextResponse.json({ error: 'Missing jobId or avatarName' }, { status: 400 })
  }

  const media = getJobMedia(jobId, 'final')
  if (!media) {
    return NextResponse.json({ error: 'Final video not ready or job not found' }, { status: 404 })
  }

  const videoBuffer = media.buffer
  const numChunks = Math.ceil(videoBuffer.length / CHUNK_SIZE)

  try {
    // 1. Create avatar resource
    const createRes = await fetch(`${BASE_URL}/avatars`, {
      method: 'POST',
      headers: { ...beyHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: avatarName }),
    })
    if (!createRes.ok) {
      throw new Error(`Bey create avatar failed (${createRes.status}): ${await createRes.text()}`)
    }
    const { id: avatarId } = await createRes.json() as { id: string }

    // 2. Initialise chunked upload
    const initRes = await fetch(
      `${BASE_URL}/avatars/${avatarId}/training-video/upload?num_chunks=${numChunks}&video_format=mp4`,
      { method: 'POST', headers: beyHeaders() }
    )
    if (!initRes.ok) {
      throw new Error(`Bey init upload failed (${initRes.status}): ${await initRes.text()}`)
    }

    // 3. Upload chunks sequentially
    for (let i = 0; i < numChunks; i++) {
      const start = i * CHUNK_SIZE
      const chunk = videoBuffer.subarray(start, start + CHUNK_SIZE)
      const uploadRes = await fetch(
        `${BASE_URL}/avatars/${avatarId}/training-video/upload?chunk_number=${i}`,
        {
          method: 'PUT',
          headers: beyHeaders(),
          body: chunk as unknown as BodyInit,
        }
      )
      if (!uploadRes.ok) {
        throw new Error(`Bey chunk ${i}/${numChunks} upload failed (${uploadRes.status}): ${await uploadRes.text()}`)
      }
    }

    // 4. Submit — starts training (~5–6 hours)
    const submitRes = await fetch(
      `${BASE_URL}/avatars/${avatarId}/training-video/submit`,
      { method: 'POST', headers: beyHeaders() }
    )
    if (!submitRes.ok) {
      throw new Error(`Bey submit failed (${submitRes.status}): ${await submitRes.text()}`)
    }

    // 5. Confirm status is "training"
    const statusRes = await fetch(`${BASE_URL}/avatars/${avatarId}`, { headers: beyHeaders() })
    const statusData = statusRes.ok ? await statusRes.json() as { status?: string } : {}
    const beyStatus = statusData.status ?? 'training'

    return NextResponse.json({ avatarId, status: beyStatus })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[bey-create]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
