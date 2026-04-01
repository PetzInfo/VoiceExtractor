import { NextResponse } from 'next/server'
import { searchExecutiveMedia } from '@/lib/search'

export const maxDuration = 15

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, title, companyUrl } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid name parameter' }, { status: 400 })
    }

    if (!process.env.SERPER_API_KEY) {
      return NextResponse.json({ error: 'SERPER_API_KEY not configured on server' }, { status: 500 })
    }

    const results = await searchExecutiveMedia(name, title ?? '', companyUrl ?? '')

    return NextResponse.json({ results })
  } catch (err: unknown) {
    console.error('[/api/search] Error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
