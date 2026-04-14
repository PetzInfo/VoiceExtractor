import { NextResponse } from 'next/server'
import { getJob } from '@/lib/avatar-jobs'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const job = getJob(jobId)

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    steps: job.steps,
    error: job.error,
    // Flags — client fetches the actual data separately via /api/avatar/media/[jobId]/[type]
    hasKlingVideo:   !!job.media.kling,
    hasTtsAudio:     !!job.media.tts,
    hasHeygenVideo:  !!job.media.heygen,
    hasFinalVideo:   !!job.media.final,
  })
}
