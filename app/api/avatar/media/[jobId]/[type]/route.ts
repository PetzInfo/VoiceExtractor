import { NextResponse } from 'next/server'
import * as fs from 'fs/promises'
import { getJobMedia, MediaType } from '@/lib/avatar-jobs'

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

  const media = getJobMedia(jobId, type as MediaType)
  if (!media) {
    return NextResponse.json({ error: 'Media not ready or job not found' }, { status: 404 })
  }

  const buffer = await fs.readFile(media.filePath)
  return NextResponse.json({
    data: buffer.toString('base64'),
    mimeType: media.mimeType,
  })
}
