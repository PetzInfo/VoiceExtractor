import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs/promises'
import * as path from 'path'
import { cleanupTmpFiles, bufferToBase64 } from '@/lib/audio-utils'

export const maxDuration = 60
export const runtime = 'nodejs'

const FFMPEG_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}`,
}

function extractClip(inputPath: string, outputPath: string, startSec: number, durationSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const proc = spawn('ffmpeg', [
      '-i', inputPath,
      '-ss', String(startSec),
      '-t', String(durationSec),
      '-ar', '44100',
      '-ac', '1',
      '-q:a', '2',
      '-c:a', 'libmp3lame', '-y',
      outputPath,
    ], { env: FFMPEG_ENV })
    proc.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)))
    proc.on('error', (err: Error) => reject(err))
  })
}

export async function POST(req: Request) {
  const tmpFiles: string[] = []

  try {
    const body = await req.json()
    const { sessionId, startSec, durationSec = 15 } = body

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }
    if (typeof startSec !== 'number') {
      return NextResponse.json({ error: 'Missing startSec' }, { status: 400 })
    }

    const sessionFilePath = path.join('/tmp', `voice-session-${sessionId}.mp3`)

    // Check session file still exists
    try {
      await fs.access(sessionFilePath)
    } catch {
      return NextResponse.json(
        { error: 'Session expired — please re-process the audio source.' },
        { status: 404 }
      )
    }

    const outputPath = path.join('/tmp', `${uuidv4()}_reextract.mp3`)
    tmpFiles.push(outputPath)

    const clampedStart = Math.max(0, startSec)
    const clampedDuration = Math.max(5, Math.min(120, durationSec))

    console.log(`[reextract] session=${sessionId} start=${clampedStart}s duration=${clampedDuration}s`)
    await extractClip(sessionFilePath, outputPath, clampedStart, clampedDuration)

    await fs.access(outputPath)
    const audioBuffer = await fs.readFile(outputPath)
    const audioBase64 = bufferToBase64(audioBuffer)

    return NextResponse.json({
      audioBase64,
      mimeType: 'audio/mpeg',
      windowStart: clampedStart,
      windowEnd: clampedStart + clampedDuration,
      duration: clampedDuration,
    })
  } catch (err: unknown) {
    console.error('[/api/voice/reextract] Error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    await cleanupTmpFiles(tmpFiles)
  }
}
