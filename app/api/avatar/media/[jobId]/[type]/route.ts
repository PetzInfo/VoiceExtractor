import { NextResponse } from 'next/server'
import * as fs from 'fs/promises'
import { getJob, MediaType } from '@/lib/avatar-jobs'
import { getHeyGenVideoUrl } from '@/lib/heygen'

export const runtime = 'nodejs'

const VALID_TYPES: MediaType[] = ['idle', 'tts', 'heygen', 'final']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string; type: string }> }
) {
  const { jobId, type } = await params

  if (!VALID_TYPES.includes(type as MediaType)) {
    return NextResponse.json({ error: 'Invalid media type' }, { status: 400 })
  }

  const job = getJob(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // idle and heygen: fetch a fresh presigned URL from HeyGen — video stays on their CDN
  if (type === 'idle' || type === 'heygen') {
    const videoId = job.heygenVideoIds[type]
    if (!videoId) return NextResponse.json({ error: 'Media not ready' }, { status: 404 })
    const url = await getHeyGenVideoUrl(videoId)
    return NextResponse.json({ url, mimeType: 'video/mp4' })
  }

  // tts: small file — return as base64 data URL (safe to load into memory)
  if (type === 'tts') {
    const media = job.media.tts
    if (!media) return NextResponse.json({ error: 'Media not ready' }, { status: 404 })
    const buffer = await fs.readFile(media.filePath)
    return NextResponse.json({
      url: `data:${media.mimeType};base64,${buffer.toString('base64')}`,
      mimeType: media.mimeType,
    })
  }

  // final: return URL pointing to the streaming endpoint — never base64 a 100MB+ video
  if (type === 'final') {
    if (!job.media.final) return NextResponse.json({ error: 'Media not ready' }, { status: 404 })
    return NextResponse.json({
      url: `/api/avatar/stream/${jobId}`,
      mimeType: 'video/mp4',
    })
  }

  return NextResponse.json({ error: 'Invalid media type' }, { status: 400 })
}
