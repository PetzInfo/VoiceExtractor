'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Invalid access key')
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
            style={{ background: '#151b42', border: '1px solid #2e3a6e' }}>
            <svg className="w-7 h-7" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">EXEC VOICE REPLIC8</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>Authorized personnel only</p>
        </div>

        <div className="rounded-2xl p-8 shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="text-base font-semibold text-white mb-5">Enter access key</h2>

          {error && (
            <div className="mb-4 flex items-center gap-2 text-sm rounded-lg px-4 py-3"
              style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', color: '#fca5a5' }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="key" className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
                Access Key
              </label>
              <input
                id="key"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter your pentest access key"
                className="w-full rounded-lg px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none transition-colors"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                required
                autoComplete="current-password"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading || !key}
              className="w-full text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: loading || !key ? 'var(--bg-hover)' : 'var(--accent)' }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Authenticating...
                </>
              ) : 'Access Platform'}
            </button>
          </form>

          <p className="mt-6 text-xs text-center" style={{ color: 'var(--text-3)' }}>
            This system is for authorized security personnel only.
          </p>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-3)' }}>
          Exec Voice Replic8 — Security Awareness Training Platform
        </p>
      </div>
    </div>
  )
}
