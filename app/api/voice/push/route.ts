import { NextResponse } from 'next/server'
import axios from 'axios'
import FormData from 'form-data'
import { base64ToBuffer } from '@/lib/audio-utils'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { audioBase64, executiveName, role, language } = body

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid audioBase64 parameter' }, { status: 400 })
    }

    if (!executiveName || typeof executiveName !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid executiveName parameter' }, { status: 400 })
    }

    const apiKey = process.env.CARTESIA_API_KEY
    if (!apiKey) throw new Error('CARTESIA_API_KEY not configured')

    // Use detected language from the media source; fall back to 'en'
    const voiceLanguage: string = (typeof language === 'string' && language.length === 2) ? language : 'en'
    console.log('[Cartesia] Using language:', voiceLanguage)

    const audioBuffer = base64ToBuffer(audioBase64)

    // Single-step Instant Voice Cloning — POST /voices/clone
    // This is the same endpoint Cartesia's UI uses; returns voice id directly
    const form = new FormData()
    form.append('clip', audioBuffer, { filename: 'voice_sample.mp3', contentType: 'audio/mpeg' })
    form.append('name', executiveName)
    form.append('description', 'Executive voice for security awareness training')
    form.append('language', voiceLanguage)
    // enhance=false → preserve voice similarity (better for cloning a specific person)
    form.append('enhance', 'false')

    console.log('[Cartesia] Calling POST /voices/clone (instant cloning)...')

    const cloneRes = await axios.post('https://api.cartesia.ai/voices/clone', form, {
      headers: {
        ...form.getHeaders(),
        'X-API-Key': apiKey,
        'Cartesia-Version': '2025-04-16',
      },
      timeout: 60000,
    })

    console.log('[Cartesia] /voices/clone response:', JSON.stringify(cloneRes.data).slice(0, 300))

    const voiceId: string = cloneRes.data.id
    if (!voiceId) {
      throw new Error(`Cartesia /voices/clone did not return an id. Response: ${JSON.stringify(cloneRes.data)}`)
    }
    console.log('[Cartesia] Voice created via instant clone:', voiceId)

    // Split full name into first / last — strip middle initials like "G." or "G"
    const meaningfulParts = executiveName.trim().split(/\s+/).filter(p => !/^[A-Za-z]\.?$/.test(p))
    const firstName = meaningfulParts[0] || ''
    const lastName = meaningfulParts.length > 1 ? meaningfulParts[meaningfulParts.length - 1] : ''

    // Infer salutation from name using Claude — handles international names correctly
    let salutation: 'HE' | 'SHE' | 'NOT_FOUND' = 'NOT_FOUND'
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages
      const salRes = await claude.create({
        model: 'claude-haiku-4-5',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `What is the most likely gender of the person named "${executiveName}"? Reply with exactly one word: HE, SHE, or NOT_FOUND.`,
        }],
      })
      const raw = (salRes.content[0].type === 'text' ? salRes.content[0].text : '').trim().toUpperCase()
      if (raw === 'HE' || raw === 'SHE' || raw === 'NOT_FOUND') salutation = raw
    } catch { /* keep NOT_FOUND */ }

    const output = {
      firstName,
      lastName,
      salutation,
      email: '',
      role: 'CEO',
      phoneNumber: '',
      recordingLanguage: voiceLanguage.toUpperCase(),
      provider: 'cartesia',
      model: 'sonic-3',
      modelT2S: 'gpt-4o',
      voiceId,
      outgoingPhoneNumberId: '',
      style: 0.0,
      stability: 0.5,
      similarity: 0.7,
    }

    return NextResponse.json({ output })
  } catch (err: unknown) {
    console.error('[/api/voice/push] Error:', err)

    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 500
      const message = err.response?.data?.message ?? err.response?.data?.detail ?? err.response?.data?.error ?? err.message
      console.error('[/api/voice/push] Cartesia response body:', JSON.stringify(err.response?.data))
      return NextResponse.json({ error: `Cartesia error: ${message}` }, { status })
    }

    const message = err instanceof Error ? err.message : 'Unknown error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
