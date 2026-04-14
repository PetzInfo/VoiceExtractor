import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const BASE_URL = 'https://api.heygen.com'
const UPLOAD_URL = 'https://upload.heygen.com/v1/asset'
const POLL_INTERVAL_MS = 10_000
const TIMEOUT_MS = 600_000

function headers(apiKey: string): Record<string, string> {
  return { 'X-Api-Key': apiKey }
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

export async function generateHeyGenVideo(
  imageBuffer: Buffer,
  imageMime: string,
  audioBuffer: Buffer,
  outputPath: string,
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

  return pollAndDownload(apiKey, videoId, outputPath)
}

async function pollAndDownload(apiKey: string, videoId: string, outputPath: string): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    const resp = await fetch(`${BASE_URL}/v1/video_status.get?video_id=${videoId}`, {
      headers: headers(apiKey),
    })
    if (!resp.ok) throw new Error(`HeyGen poll error ${resp.status}: ${await resp.text()}`)
    const body = await resp.json()
    const { status, video_url, error } = body.data

    if (status === 'completed') {
      return downloadToPath(video_url as string, outputPath)
    }
    if (status === 'failed') {
      const detail = error?.detail ?? error?.message ?? 'unknown'
      throw new Error(`HeyGen render failed (${error?.code ?? '?'}): ${detail}`)
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`HeyGen video ${videoId} timed out after ${TIMEOUT_MS / 1000}s`)
}

async function downloadToPath(url: string, dest: string): Promise<string> {
  const resp = await fetch(url)
  if (!resp.ok || !resp.body) throw new Error(`Failed to download HeyGen video: ${resp.status}`)
  const ws = createWriteStream(dest)
  await pipeline(Readable.fromWeb(resp.body as import('stream/web').ReadableStream), ws)
  return dest
}
