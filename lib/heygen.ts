import { createWriteStream } from 'fs'
import * as fs from 'fs/promises'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { spawn } from 'child_process'
import * as os from 'os'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

const BASE_URL = 'https://api.heygen.com'
const UPLOAD_URL = 'https://upload.heygen.com/v1/asset'
const POLL_INTERVAL_MS = 10_000
const TIMEOUT_MS = 600_000

const FFMPEG_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}`,
}

function headers(apiKey: string): Record<string, string> {
  return { 'X-Api-Key': apiKey }
}

/** Generates 20 s of silence as an MP3 buffer using ffmpeg. */
async function generateSilenceMp3(): Promise<Buffer> {
  const dest = path.join(os.tmpdir(), `${uuidv4()}_silence.mp3`)
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '20',
      '-acodec', 'libmp3lame',
      '-y', dest,
    ], { env: FFMPEG_ENV })
    const stderr: Buffer[] = []
    proc.stderr?.on('data', (d: Buffer) => stderr.push(d))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg silence gen failed (${code}): ${Buffer.concat(stderr).toString().slice(-300)}`))
    })
    proc.on('error', (e) => reject(new Error(`ffmpeg spawn failed: ${e.message}`)))
  })
  const buf = await fs.readFile(dest)
  await fs.unlink(dest).catch(() => {})
  return buf
}

async function uploadAsset(apiKey: string, buffer: Buffer, mimeType: string): Promise<string> {
  const resp = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { ...headers(apiKey), 'Content-Type': mimeType },
    body: buffer as unknown as BodyInit,
  })
  if (!resp.ok) throw new Error(`HeyGen upload error ${resp.status}: ${await resp.text()}`)
  const body = await resp.json()
  return body.data.id as string
}

/** Polls until the video is complete and returns the presigned video_url. */
async function pollForVideoUrl(apiKey: string, videoId: string): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    const resp = await fetch(`${BASE_URL}/v1/video_status.get?video_id=${videoId}`, {
      headers: headers(apiKey),
    })
    if (!resp.ok) throw new Error(`HeyGen poll error ${resp.status}: ${await resp.text()}`)
    const body = await resp.json()
    const { status, video_url, error } = body.data

    if (status === 'completed') return video_url as string
    if (status === 'failed') {
      const detail = error?.detail ?? error?.message ?? 'unknown'
      throw new Error(`HeyGen render failed (${error?.code ?? '?'}): ${detail}`)
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`HeyGen video ${videoId} timed out after ${TIMEOUT_MS / 1000}s`)
}

/** Fetches a fresh presigned URL for an already-completed HeyGen video. */
export async function getHeyGenVideoUrl(videoId: string): Promise<string> {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) throw new Error('HEYGEN_API_KEY not configured')
  const resp = await fetch(`${BASE_URL}/v1/video_status.get?video_id=${videoId}`, {
    headers: headers(apiKey),
  })
  if (!resp.ok) throw new Error(`HeyGen get video error ${resp.status}: ${await resp.text()}`)
  const body = await resp.json()
  const url = body.data?.video_url
  if (!url) throw new Error(`HeyGen video ${videoId} has no video_url`)
  return url as string
}

/**
 * Submits an idle video job (image + 20s silence) and polls until complete.
 * Returns the HeyGen video ID — does NOT download the video.
 */
export async function generateHeyGenIdleVideo(
  imageBuffer: Buffer,
  imageMime: string,
): Promise<string> {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) throw new Error('HEYGEN_API_KEY not configured')

  const [imageAssetId, silenceBuffer] = await Promise.all([
    uploadAsset(apiKey, imageBuffer, imageMime),
    generateSilenceMp3(),
  ])
  const silenceAssetId = await uploadAsset(apiKey, silenceBuffer, 'audio/mpeg')

  const resp = await fetch(`${BASE_URL}/v3/videos`, {
    method: 'POST',
    headers: { ...headers(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'image',
      image: { type: 'asset_id', asset_id: imageAssetId },
      audio_asset_id: silenceAssetId,
      resolution: '720p',
      aspect_ratio: '16:9',
      expressiveness: 'low',
    }),
  })
  if (!resp.ok) throw new Error(`HeyGen idle generate error ${resp.status}: ${await resp.text()}`)
  const body = await resp.json()
  const videoId: string = body.data?.video_id
  if (!videoId) throw new Error(`HeyGen did not return a video_id: ${JSON.stringify(body)}`)

  await pollForVideoUrl(apiKey, videoId)
  return videoId
}

/**
 * Submits a talking-head video job and polls until complete.
 * Returns the HeyGen video ID — does NOT download the video.
 */
export async function generateHeyGenVideo(
  imageBuffer: Buffer,
  imageMime: string,
  audioBuffer: Buffer,
  opts: {
    expressiveness?: 'low' | 'medium' | 'high'
    resolution?: string
    aspect_ratio?: string
  } = {}
): Promise<string> {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) throw new Error('HEYGEN_API_KEY not configured')

  const { expressiveness = 'low', resolution = '720p', aspect_ratio = '16:9' } = opts

  const imageAssetId = await uploadAsset(apiKey, imageBuffer, imageMime)
  const audioAssetId = await uploadAsset(apiKey, audioBuffer, 'audio/mpeg')

  const resp = await fetch(`${BASE_URL}/v2/videos`, {
    method: 'POST',
    headers: { ...headers(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_asset_id: imageAssetId, audio_asset_id: audioAssetId, expressiveness, resolution, aspect_ratio }),
  })
  if (!resp.ok) throw new Error(`HeyGen generate error ${resp.status}: ${await resp.text()}`)
  const body = await resp.json()
  const videoId: string = body.video_id ?? body.data?.video_id
  if (!videoId) throw new Error(`HeyGen did not return a video_id: ${JSON.stringify(body)}`)

  await pollForVideoUrl(apiKey, videoId)
  return videoId
}

export async function downloadToPath(url: string, dest: string): Promise<string> {
  const resp = await fetch(url)
  if (!resp.ok || !resp.body) throw new Error(`Failed to download HeyGen video: ${resp.status}`)
  const ws = createWriteStream(dest)
  await pipeline(Readable.fromWeb(resp.body as import('stream/web').ReadableStream), ws)
  return dest
}
