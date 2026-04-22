import { NextResponse } from 'next/server'
import * as fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { spawn } from 'child_process'

export const runtime = 'nodejs'
export const maxDuration = 120

const BASE_URL = 'https://api.bey.dev/v1'
const CHUNK_SIZE = 16 * 1024 * 1024 // 16 MB
const MIN_DURATION_SEC = 160 // 2:40

function beyHeaders(): Record<string, string> {
  const key = process.env.BEY_API_KEY
  if (!key) throw new Error('BEY_API_KEY not configured')
  return { 'x-api-key': key }
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])
    let out = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', () => resolve(parseFloat(out.trim()) || 0))
    proc.on('error', () => resolve(0))
  })
}

export async function POST(req: Request) {
  // Auth — route is excluded from middleware to avoid body buffering limits
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  const key =
    req.headers.get('x-pentest-key') ??
    new URL(req.url).searchParams.get('key') ??
    jar.get('pentest_key')?.value
  if (key !== process.env.PENTEST_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const videoPath = `/tmp/${uuidv4()}_upload.mp4`

  try {
    const formData = await req.formData()
    const videoFile = formData.get('video') as File | null
    const avatarName = (formData.get('avatarName') as string | null)?.trim()

    if (!videoFile || !avatarName) {
      return NextResponse.json({ error: 'Missing video or avatarName' }, { status: 400 })
    }

    // Write to disk — avoid holding the whole buffer in memory past this point
    const videoBuffer = Buffer.from(await videoFile.arrayBuffer())
    await fs.writeFile(videoPath, videoBuffer)
    videoBuffer.fill(0)

    // Validate duration
    const duration = await getVideoDuration(videoPath)
    if (duration < MIN_DURATION_SEC) {
      const actual = `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
      return NextResponse.json(
        { error: `Video too short: ${actual} — minimum is 2:40 (160 seconds)` },
        { status: 422 }
      )
    }

    const stat = await fs.stat(videoPath)
    const fileSize = stat.size
    const numChunks = Math.ceil(fileSize / CHUNK_SIZE)

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

    // 3. Upload chunks — read one at a time from disk to keep memory low
    const fileHandle = await fs.open(videoPath, 'r')
    try {
      for (let i = 0; i < numChunks; i++) {
        const start = i * CHUNK_SIZE
        const chunkSize = Math.min(CHUNK_SIZE, fileSize - start)
        const chunk = Buffer.alloc(chunkSize)
        await fileHandle.read(chunk, 0, chunkSize, start)

        const uploadRes = await fetch(
          `${BASE_URL}/avatars/${avatarId}/training-video/upload?chunk_number=${i}`,
          {
            method: 'PUT',
            headers: beyHeaders(),
            body: chunk as unknown as BodyInit,
          }
        )
        if (!uploadRes.ok) {
          throw new Error(`Bey chunk ${i + 1}/${numChunks} upload failed (${uploadRes.status}): ${await uploadRes.text()}`)
        }
      }
    } finally {
      await fileHandle.close()
    }

    // 4. Submit — starts training (~5–6 hours)
    const submitRes = await fetch(
      `${BASE_URL}/avatars/${avatarId}/training-video/submit`,
      { method: 'POST', headers: beyHeaders() }
    )
    if (!submitRes.ok) {
      throw new Error(`Bey submit failed (${submitRes.status}): ${await submitRes.text()}`)
    }

    // 5. Confirm status
    const statusRes = await fetch(`${BASE_URL}/avatars/${avatarId}`, { headers: beyHeaders() })
    const statusData = statusRes.ok ? await statusRes.json() as { status?: string } : {}

    return NextResponse.json({ avatarId, status: statusData.status ?? 'training' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[bey-train]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    await fs.unlink(videoPath).catch(() => {})
  }
}
