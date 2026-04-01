import { NextResponse } from 'next/server'
import { findExecutives } from '@/lib/scraper'

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid url parameter' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'URL must use http or https protocol' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured on server' }, { status: 500 })
    }

    const executives = await findExecutives(url)

    return NextResponse.json({ executives })
  } catch (err: unknown) {
    console.error('[/api/scrape] Error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
