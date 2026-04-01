import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { key } = await req.json()

  if (!process.env.PENTEST_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration: PENTEST_KEY not set' }, { status: 500 })
  }

  if (key !== process.env.PENTEST_KEY) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('pentest_key', key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  })
  return res
}
