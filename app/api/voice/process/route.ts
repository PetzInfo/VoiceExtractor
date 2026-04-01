import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs/promises'
import * as path from 'path'
import { cleanupTmpFiles, bufferToBase64 } from '@/lib/audio-utils'
import { isPodcastPlatformUrl, downloadPodcastFromRss } from '@/lib/podcast-rss'

export const maxDuration = 120
export const runtime = 'nodejs'

const FFMPEG_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}`,
}

async function downloadAudio(url: string, outputDir: string): Promise<string> {
  const { spawn } = await import('child_process')
  const id = uuidv4()
  // Use a fixed output path — yt-dlp will convert to mp3 and write exactly this file
  const outputPath = path.join(outputDir, `${id}.mp3`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-playlist',
      '--no-continue',
      // Use iOS + TV embedded clients — bypasses YouTube's bot/login requirement on server IPs
      '--extractor-args', 'youtube:player_client=ios,tv_embedded,mweb',
      '-o', outputPath,
      url,
    ], { env: FFMPEG_ENV })

    let stderrOutput = ''
    proc.stderr.on('data', (d) => { stderrOutput += d.toString(); console.log('[yt-dlp]', d.toString()) })
    proc.stdout.on('data', (d) => console.log('[yt-dlp out]', d.toString()))
    proc.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(`yt-dlp failed: ${stderrOutput.slice(-300)}`))
    })
    proc.on('error', (err) => reject(new Error(`yt-dlp not found: ${err.message}`)))
  })

  // Verify the file actually exists and has content
  try {
    const stat = await fs.stat(outputPath)
    if (stat.size < 1000) throw new Error('Downloaded file is too small — likely an empty playlist or geo-blocked video')
  } catch (statErr) {
    // File might have been written with a temp extension — scan for any audio file with our id
    const files = await fs.readdir(outputDir)
    const fallback = files.find((f) => f.startsWith(id))
    if (fallback) return path.join(outputDir, fallback)
    throw new Error('Downloaded audio file not found in /tmp — video may be geo-blocked, private, or a playlist page')
  }

  return outputPath
}

// Extract a high-quality clip with ffmpeg for voice cloning
function extractClip(inputPath: string, outputPath: string, startSec: number, durationSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const proc = spawn('ffmpeg', [
      '-i', inputPath,
      '-ss', String(startSec),
      '-t', String(durationSec),
      '-ar', '44100',   // high quality sample rate for voice cloning
      '-ac', '1',       // mono
      '-q:a', '2',      // high quality VBR (~190kbps)
      '-c:a', 'libmp3lame', '-y',
      outputPath,
    ], { env: FFMPEG_ENV })
    proc.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)))
    proc.on('error', (err: Error) => reject(err))
  })
}

// Extract ONLY the executive's utterances within a window, stitched together with no interviewer audio
function extractExecutiveOnlyClip(
  inputPath: string,
  outputPath: string,
  utterances: Utterance[],
  dominantSpeaker: string,
  windowStartMs: number,
  windowEndMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')

    // Collect executive segments within the window, clipped to window boundaries
    const segments = utterances
      .filter(u => u.speaker === dominantSpeaker && u.end > windowStartMs && u.start < windowEndMs)
      .map(u => ({
        start: Math.max(u.start, windowStartMs) / 1000,
        end:   Math.min(u.end,   windowEndMs)   / 1000,
      }))
      .filter(s => s.end - s.start > 0.3) // drop fragments shorter than 300ms

    if (segments.length === 0) {
      // Nothing to stitch — fall back to plain clip extraction
      return extractClip(inputPath, outputPath, windowStartMs / 1000, 30)
        .then(resolve).catch(reject)
    }

    // aselect keeps only the chosen time ranges; asetpts removes the gaps
    const selectExpr = segments
      .map(s => `between(t,${s.start.toFixed(3)},${s.end.toFixed(3)})`)
      .join('+')

    const totalExecSec = segments.reduce((sum, s) => sum + s.end - s.start, 0)
    console.log(
      `[extractExec] Stitching ${segments.length} segments → ${totalExecSec.toFixed(1)}s of exec-only audio`
    )

    const proc = spawn('ffmpeg', [
      '-i', inputPath,
      '-af', `aselect='${selectExpr}',asetpts=N/SR/TB`,
      '-ar', '44100',
      '-ac', '1',
      '-q:a', '2',
      '-c:a', 'libmp3lame', '-y',
      outputPath,
    ], { env: FFMPEG_ENV })

    proc.stderr.on('data', (d: Buffer) => console.log('[ffmpeg aselect]', d.toString().trim()))
    proc.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`ffmpeg aselect exited with code ${code}`)))
    proc.on('error', (err: Error) => reject(err))
  })
}


function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const { spawn } = require('child_process')
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { env: FFMPEG_ENV })
    let out = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', () => resolve(parseFloat(out.trim()) || 0))
    proc.on('error', () => resolve(0))
  })
}

interface Utterance {
  speaker: string
  start: number  // ms
  end: number    // ms
  text: string
}

async function diarizeAndExtract(
  audioPath: string,
  outputPath: string,
  tmpDir: string
): Promise<{ diarization: object | null; method: string; windowStart: number; windowEnd: number }> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) {
    // No AssemblyAI — fall back to a clip starting at 60s (skip intro)
    console.log('[diarize] No ASSEMBLYAI_API_KEY — using fallback clip at 60s')
    await extractClip(audioPath, outputPath, 60, 30)
    return { diarization: null, method: 'fallback_clip', windowStart: 60, windowEnd: 90 }
  }

  try {
    // 1. Check file is large enough before uploading
    const stats = await fs.stat(audioPath)
    if (stats.size < 10_000) {
      console.warn('[diarize] Audio file too small to diarize, using fallback')
      await extractClip(audioPath, outputPath, 60, 30)
      return { diarization: null, method: 'fallback_clip', windowStart: 60, windowEnd: 90 }
    }

    // Upload the full downloaded audio (more reliable than a trimmed chunk)
    const audioBuffer = await fs.readFile(audioPath)
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: { authorization: apiKey, 'content-type': 'application/octet-stream' },
      body: audioBuffer,
    })
    if (!uploadRes.ok) throw new Error(`AssemblyAI upload failed: ${uploadRes.status}`)
    const { upload_url } = await uploadRes.json()

    // 2. Request transcription with speaker diarization
    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { authorization: apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ audio_url: upload_url, speaker_labels: true }),
    })
    if (!transcriptRes.ok) {
      const errBody = await transcriptRes.text()
      throw new Error(`AssemblyAI 400: ${errBody}`)
    }
    const { id: transcriptId } = await transcriptRes.json()

    // 3. Poll for completion
    let utterances: Utterance[] = []
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const statusRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { authorization: apiKey },
      })
      if (!statusRes.ok) continue
      const data = await statusRes.json()
      console.log(`[AssemblyAI] Poll ${i + 1}: ${data.status}`)
      if (data.status === 'completed') {
        utterances = data.utterances ?? []
        break
      }
      if (data.status === 'error') throw new Error(`AssemblyAI error: ${data.error}`)
    }

    if (utterances.length === 0) {
      console.warn('[diarize] No utterances returned — falling back to clip')
      await extractClip(audioPath, outputPath, 60, 30)
      return { diarization: null, method: 'fallback_clip', windowStart: 60, windowEnd: 90 }
    }

    // 4. Find dominant speaker (most total speaking time = executive/interviewee)
    const speakerTime: Record<string, number> = {}
    for (const u of utterances) {
      speakerTime[u.speaker] = (speakerTime[u.speaker] ?? 0) + (u.end - u.start)
    }
    const dominantSpeaker = Object.entries(speakerTime).sort((a, b) => b[1] - a[1])[0][0]
    console.log(`[diarize] Speaker times:`, speakerTime, `→ dominant: ${dominantSpeaker}`)

    // 5. Slide a 30s window across the timeline, find where executive speaks the most
    const WINDOW_MS = 30000
    const STEP_MS = 1000 // 1s resolution

    const totalDuration = utterances[utterances.length - 1].end
    let bestWindowStart = 60000 // default: skip first 60s (intro)
    let bestExecMs = 0

    for (let windowStart = 0; windowStart + WINDOW_MS <= totalDuration; windowStart += STEP_MS) {
      const windowEnd = windowStart + WINDOW_MS
      let execMs = 0

      for (const u of utterances) {
        if (u.speaker !== dominantSpeaker) continue
        // Calculate overlap of utterance with this window
        const overlapStart = Math.max(u.start, windowStart)
        const overlapEnd = Math.min(u.end, windowEnd)
        if (overlapEnd > overlapStart) execMs += overlapEnd - overlapStart
      }

      if (execMs > bestExecMs) {
        bestExecMs = execMs
        bestWindowStart = windowStart
      }
    }

    const bestWindowStartSec = bestWindowStart / 1000
    const bestWindowEndSec = bestWindowStartSec + WINDOW_MS / 1000
    console.log(`[diarize] Best 30s window at ${bestWindowStartSec}s — executive speaks ${(bestExecMs / 1000).toFixed(1)}s out of 30s`)

    // 6. Extract ONLY the executive's utterances within that window (no interviewer audio)
    await extractExecutiveOnlyClip(
      audioPath, outputPath, utterances, dominantSpeaker,
      bestWindowStart, bestWindowStart + WINDOW_MS
    )

    const diarization = {
      speakers: Object.keys(speakerTime).length,
      dominantSpeaker,
      speakerTime,
      utterances: utterances.slice(0, 10),
    }

    return { diarization, method: 'diarization', windowStart: bestWindowStartSec, windowEnd: bestWindowEndSec }
  } catch (err) {
    console.warn('[diarize] Failed, falling back to clip:', err)
    await extractClip(audioPath, outputPath, 60, 30)
    return { diarization: null, method: 'fallback_clip', windowStart: 60, windowEnd: 90 }
  }
}

export async function POST(req: Request) {
  const tmpFiles: string[] = []

  try {
    const body = await req.json()
    const { url, executiveName = 'Executive' } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid url parameter' }, { status: 400 })
    }

    const tmpDir = '/tmp'
    const sessionId = uuidv4()
    const sessionFilePath = path.join(tmpDir, `voice-session-${sessionId}.mp3`)
    const outputId = uuidv4()
    const outputPath = path.join(tmpDir, `${outputId}_executive.mp3`)

    // 1. Download full audio — route to RSS downloader for podcast platforms, yt-dlp for everything else
    let downloadedPath: string
    try {
      if (isPodcastPlatformUrl(url)) {
        console.log('[process] Podcast platform detected — using RSS downloader')
        const podcastOutputPath = path.join(tmpDir, `${uuidv4()}.mp3`)
        await downloadPodcastFromRss(url, executiveName, podcastOutputPath)
        downloadedPath = podcastOutputPath
      } else {
        downloadedPath = await downloadAudio(url, tmpDir)
      }
      // Rename to a stable session file that survives cleanup (NOT added to tmpFiles)
      await fs.rename(downloadedPath, sessionFilePath)
      console.log(`[process] Session file: ${sessionFilePath}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: `Failed to download audio: ${message}. Ensure youtube-dl/yt-dlp is installed.` },
        { status: 422 }
      )
    }

    // Get total duration for the timeline scrubber
    const totalDuration = await getAudioDuration(sessionFilePath)
    console.log(`[process] Total duration: ${totalDuration.toFixed(1)}s`)

    tmpFiles.push(outputPath)

    // 2. Diarize and extract executive-only audio
    const { diarization, method, windowStart, windowEnd } = await diarizeAndExtract(sessionFilePath, outputPath, tmpDir)
    console.log(`[process] Audio extracted via: ${method}, window: ${windowStart}s – ${windowEnd}s`)

    // 3. Read output
    await fs.access(outputPath)
    const audioBuffer = await fs.readFile(outputPath)
    const audioBase64 = bufferToBase64(audioBuffer)
    const filename = `${(executiveName ?? 'executive').replace(/\s+/g, '_').toLowerCase()}_voice_sample.mp3`

    return NextResponse.json({
      audioBase64,
      mimeType: 'audio/mpeg',
      diarization,
      method,
      duration: windowEnd - windowStart,
      filename,
      sessionId,
      totalDuration,
      windowStart,
      windowEnd,
    })
  } catch (err: unknown) {
    console.error('[/api/voice/process] Error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    await cleanupTmpFiles(tmpFiles)
  }
}
