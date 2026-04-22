import { createReadStream } from 'fs'
import * as fs from 'fs/promises'
import { Readable } from 'stream'
import { getJob } from '@/lib/avatar-jobs'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const job = getJob(jobId)
  const media = job?.media.final

  if (!media) {
    return new Response(JSON.stringify({ error: 'Final video not ready or job not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const stat = await fs.stat(media.filePath)
  const stream = createReadStream(media.filePath)

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(stat.size),
      'Content-Disposition': 'attachment; filename="avatar_final.mp4"',
    },
  })
}
