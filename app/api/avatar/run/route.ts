import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import FormData from 'form-data'
import { base64ToBuffer, cleanupTmpFiles } from '@/lib/audio-utils'
import { generateKlingVideo } from '@/lib/kling'
import { generateHeyGenVideo } from '@/lib/heygen'
import { createJob, updateJobStep, setJobMedia, completeJob, failJob } from '@/lib/avatar-jobs'

export const runtime = 'nodejs'
export const maxDuration = 60 // Only needs to cover job creation, not the pipeline itself

// ── Hardcoded pipeline constants (from Pipeline.py defaults) ──────────────────

const KLING_PROMPT =
  'A realistic man looks directly into the camera, completely silent and almost perfectly still. His head is fully fixed in place, as if physically stabilized — no movement, no nodding, no tilting, no micro-movements of the head or neck at all. His mouth remains fully closed at all times, with no lip or jaw movement under any circumstances. His expression is neutral, calm, and steady. Eye contact is fixed and unwavering. Breathing is extremely subtle and barely perceptible, with only minimal chest movement — almost imperceptible. His body remains stable and grounded, with no posture shifts or gestures. No facial acting, no emotional reactions, no expressive behavior. The overall impression is a silent, highly controlled human presence, similar to a frozen moment or stabilized live frame. Static camera, medium close-up, warm ambient lighting, ultra-realistic human appearance.'

const KLING_DURATION = 10

const DEFAULT_SCRIPT = `Hey, how's it going. I am a Voice Clone, and I'd like to tell you about a company that really impressed me. They're called revel8, a cybersecurity startup based in Munich, Germany.
        So here's the thing. Every organization today faces the same challenge. You can invest millions in firewalls, endpoint protection, and all the technical security you want. But at the end of the day, the biggest vulnerability is always the human element. Attackers know this, and they're getting incredibly good at exploiting it.
        We're not talking about obvious scam emails anymore. Modern social engineering attacks use cloned voices, deepfake video calls, and perfectly personalized phishing emails that are almost impossible to distinguish from the real thing. And these attacks are targeting everyone, from junior employees all the way up to the C-suite.
        That's exactly what revel8 addresses. They've built an AI-native platform that simulates real-world social engineering attacks in a completely safe environment. Their system runs realistic scenarios, things like phishing emails, suspicious phone calls, even deepfake video meetings, and tests how employees respond.
        What I find particularly compelling about their approach is the personalization. They don't just send out the same generic test to everyone. They use publicly available information to craft scenarios that are tailored to each individual, their role, their company, their digital footprint. Exactly how a real attacker would operate.
        And it's not a one-time exercise. The platform creates a continuous learning loop that adapts over time. Employees who are already quite sharp get more sophisticated scenarios, while those who need more support receive additional training. The difficulty scales with awareness.
        For security leaders, revel8 provides a complete analytics dashboard. You can see where the human risk sits in your organization, track how awareness improves over time, and generate compliance-ready reports. Everything is automated, so there's minimal operational overhead.
        What really sets them apart is the quality of their simulations. The deepfake technology they use is genuinely convincing. When you experience one of their scenarios firsthand, it makes you realize just how vulnerable most organizations actually are. And that moment of realization is exactly what drives lasting behavioral change.
        They're based in Munich, they're growing fast, and they're already working with major enterprise customers across Europe. I genuinely believe that what revel8 is building represents the future of security awareness.
        If you're interested in learning more or seeing a demo, I'd highly recommend reaching out to their team. Thanks for listening, and have a great day. Bye.`

const CARTESIA_MODEL = 'sonic-multilingual'
const CARTESIA_VERSION = '2026-03-01'

const FFMPEG_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}`,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { env: FFMPEG_ENV })
    const stderr: Buffer[] = []
    proc.stderr?.on('data', (c: Buffer) => stderr.push(c))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderr).toString().slice(-500)}`))
    })
    proc.on('error', (e) => reject(new Error(`ffmpeg spawn failed: ${e.message}`)))
  })
}

/** Returns video duration in seconds via ffprobe. */
function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { env: FFMPEG_ENV })
    const out: Buffer[] = []
    proc.stdout?.on('data', (c: Buffer) => out.push(c))
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}`))
      const dur = parseFloat(Buffer.concat(out).toString().trim())
      if (isNaN(dur)) return reject(new Error('ffprobe returned non-numeric duration'))
      resolve(dur)
    })
    proc.on('error', (e) => reject(new Error(`ffprobe not found: ${e.message}`)))
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { avatarName, imageBase64, voiceId, audioBase64, language } = await req.json()

  if (!avatarName || !imageBase64) {
    return NextResponse.json({ error: 'Missing avatarName or imageBase64' }, { status: 400 })
  }
  if (!voiceId && !audioBase64) {
    return NextResponse.json({ error: 'Provide either voiceId or audioBase64' }, { status: 400 })
  }

  const jobId = uuidv4()
  createJob(jobId)

  // Start pipeline in the background — returns immediately, client polls for status
  runPipeline(jobId, { avatarName, imageBase64, voiceId, audioBase64, language: language ?? 'de' })
    .catch((err) => {
      // Last-resort catch — failJob should have been called inside runPipeline already
      console.error('[avatar/run] Unhandled pipeline error:', err)
      failJob(jobId, err instanceof Error ? err.message : String(err))
    })

  return NextResponse.json({ jobId })
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function runPipeline(
  jobId: string,
  input: { avatarName: string; imageBase64: string; voiceId?: string; audioBase64?: string; language: string }
): Promise<void> {
  const id = uuidv4()
  const tmpFiles: string[] = []

  const imageMimeMatch = input.imageBase64.match(/^data:([^;]+);base64,/)
  const imageMime = imageMimeMatch?.[1] ?? 'image/png'
  const imageExt = imageMime.split('/')[1] ?? 'png'
  const imagePath = `/tmp/${id}_img.${imageExt}`

  try {
    const imageBuffer = base64ToBuffer(input.imageBase64.replace(/^data:[^;]+;base64,/, ''))
    await fs.writeFile(imagePath, imageBuffer)
    tmpFiles.push(imagePath)

    // ── Step 1: Kling (two clips in parallel → 20 s idle) ─────────────────
    updateJobStep(jobId, 0, 'running')
    const [klingPath1, klingPath2] = await Promise.all([
      generateKlingVideo(input.imageBase64, KLING_PROMPT, KLING_DURATION),
      generateKlingVideo(input.imageBase64, KLING_PROMPT, KLING_DURATION),
    ])
    tmpFiles.push(klingPath1, klingPath2)
    setJobMedia(jobId, 'kling', await fs.readFile(klingPath1), 'video/mp4')
    updateJobStep(jobId, 0, 'done')

    // ── Step 2: Cartesia voice + TTS ───────────────────────────────────────
    updateJobStep(jobId, 1, 'running')
    let resolvedVoiceId: string

    if (input.voiceId) {
      resolvedVoiceId = input.voiceId.trim()
    } else {
      const audioBuffer = base64ToBuffer(input.audioBase64!)
      const form = new FormData()
      form.append('clip', audioBuffer, { filename: 'voice_sample.mp3', contentType: 'audio/mpeg' })
      form.append('name', input.avatarName)
      form.append('description', `Avatar voice clone for ${input.avatarName}`)
      form.append('language', input.language)
      form.append('enhance', 'false')

      const cartesiaKey = process.env.CARTESIA_API_KEY
      if (!cartesiaKey) throw new Error('CARTESIA_API_KEY not configured')

      const cloneRes = await axios.post('https://api.cartesia.ai/voices/clone', form, {
        headers: { ...form.getHeaders(), 'X-API-Key': cartesiaKey, 'Cartesia-Version': CARTESIA_VERSION },
        timeout: 60_000,
      })
      resolvedVoiceId = cloneRes.data.id
      if (!resolvedVoiceId) throw new Error(`Cartesia clone did not return an id: ${JSON.stringify(cloneRes.data)}`)
    }

    const ttsPath = `/tmp/${id}_tts.mp3`
    tmpFiles.push(ttsPath)
    const cartesiaKey = process.env.CARTESIA_API_KEY
    if (!cartesiaKey) throw new Error('CARTESIA_API_KEY not configured')

    const ttsRes = await axios.post(
      'https://api.cartesia.ai/tts/bytes',
      {
        model_id: CARTESIA_MODEL,
        transcript: DEFAULT_SCRIPT,
        voice: { mode: 'id', id: resolvedVoiceId },
        output_format: { container: 'mp3', encoding: 'mp3', sample_rate: 44100 },
        language: input.language,
      },
      {
        headers: { 'X-API-Key': cartesiaKey, 'Cartesia-Version': CARTESIA_VERSION, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
        timeout: 120_000,
      }
    )
    const ttsBuffer2 = Buffer.from(ttsRes.data)
    await fs.writeFile(ttsPath, ttsBuffer2)
    setJobMedia(jobId, 'tts', ttsBuffer2, 'audio/mpeg')
    updateJobStep(jobId, 1, 'done')

    // ── Step 3: HeyGen ─────────────────────────────────────────────────────
    updateJobStep(jobId, 2, 'running')
    const heygenPath = `/tmp/${id}_heygen.mp4`
    tmpFiles.push(heygenPath)
    const ttsBuffer = await fs.readFile(ttsPath)
    await generateHeyGenVideo(imageBuffer, imageMime, ttsBuffer, heygenPath)
    setJobMedia(jobId, 'heygen', await fs.readFile(heygenPath), 'video/mp4')
    updateJobStep(jobId, 2, 'done')

    // ── Step 4: Merge (kling1 + kling2 + heygen) ──────────────────────────
    updateJobStep(jobId, 3, 'running')
    const finalPath = `/tmp/${id}_final.mp4`
    tmpFiles.push(finalPath)
    // Both Kling clips are silent — synthesise silence for each
    const [kling1Duration, kling2Duration] = await Promise.all([
      getVideoDuration(klingPath1),
      getVideoDuration(klingPath2),
    ])
    await ffmpeg([
      '-i', klingPath1,
      '-i', klingPath2,
      '-i', heygenPath,
      '-filter_complex',
        `aevalsrc=0:c=stereo:s=48000:d=${kling1Duration}[a0];` +
        `aevalsrc=0:c=stereo:s=48000:d=${kling2Duration}[a1];` +
        `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];` +
        `[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];` +
        `[2:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];` +
        `[v0][a0][v1][a1][v2][2:a]concat=n=3:v=1:a=1[v][a]`,
      '-map', '[v]', '-map', '[a]', '-y', finalPath,
    ])
    updateJobStep(jobId, 3, 'done')

    setJobMedia(jobId, 'final', await fs.readFile(finalPath), 'video/mp4')
    completeJob(jobId)
  } catch (err) {
    failJob(jobId, err instanceof Error ? err.message : String(err))
    throw err // re-throw so the outer .catch() can log it
  } finally {
    await cleanupTmpFiles(tmpFiles)
  }
}
