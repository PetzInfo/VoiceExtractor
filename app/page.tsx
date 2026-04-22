'use client'

import { useState, useCallback } from 'react'
import ExecutiveList from '@/components/ExecutiveList'
import MediaSourcer, { MediaResult } from '@/components/MediaSourcer'
import VoiceProcessor from '@/components/VoiceProcessor'
import AudioTimeline from '@/components/AudioTimeline'
import JSONOutput from '@/components/JSONOutput'
import AvatarGeneration from '@/components/AvatarGeneration'

type Tab = 'voice' | 'avatar'

interface Executive {
  name: string
  title: string
  linkedinHint?: string
}

interface VoiceOutput {
  firstName: string
  lastName: string
  salutation: 'HE' | 'SHE' | 'NOT_FOUND'
  email: string
  role: string
  phoneNumber: string
  recordingLanguage: string
  provider: string
  model: string
  modelT2S: string
  voiceId: string
  outgoingPhoneNumberId: string
  style: number
  stability: number
  similarity: number
}

function StepIndicator({ current }: { current: number }) {
  const steps = [
    { n: 1, label: 'Identify Target' },
    { n: 2, label: 'Find Media' },
    { n: 3, label: 'Process Audio' },
    { n: 4, label: 'Generate ID' },
  ]

  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {steps.map((step, i) => (
        <div key={step.n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step.n < current
                ? 'bg-accent text-white'
                : step.n === current
                ? 'bg-accent text-white ring-2 ring-accent ring-offset-2 ring-offset-navy-950'
                : 'text-slate-600 border border-navy-700'
            }`} style={step.n < current || step.n === current ? {} : { background: 'var(--bg-card)' }}>
              {step.n < current ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : step.n}
            </div>
            <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${
              step.n === current ? 'text-accent' : step.n < current ? 'text-slate-400' : 'text-slate-600'
            }`}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-px mx-2 mb-5 transition-all ${step.n < current ? 'bg-accent' : 'bg-navy-700'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
      <div className="border rounded-xl px-5 py-4 flex items-start gap-3 shadow-2xl"
        style={{ background: '#1a0a0a', borderColor: '#7f1d1d' }}>
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.07 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-300">Error</p>
          <p className="text-xs text-red-400 mt-0.5">{message}</p>
        </div>
        <button onClick={onDismiss} className="text-red-500 hover:text-red-300 transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border p-6 ${className}`}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {children}
    </div>
  )
}

function StepBadge({ n, current }: { n: number; current: number }) {
  const done = current > n
  const active = current === n
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
      done ? 'bg-accent text-white' : active ? 'bg-accent text-white' : 'text-slate-600'
    }`} style={!done && !active ? { background: 'var(--bg-hover)', border: '1px solid var(--border)' } : {}}>
      {done ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : n}
    </div>
  )
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>('voice')
  const [currentStep, setCurrentStep] = useState(1)
  const [companyUrl, setCompanyUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [executives, setExecutives] = useState<Executive[]>([])
  const [selectedExec, setSelectedExec] = useState<Executive | null>(null)
  const [searching, setSearching] = useState(false)
  const [mediaResults, setMediaResults] = useState<MediaResult[]>([])
  const [selectedUrl, setSelectedUrl] = useState<string | undefined>()
  const [processing, setProcessing] = useState(false)
  const [audioBase64, setAudioBase64] = useState<string | undefined>()
  const [diarization, setDiarization] = useState<unknown>(null)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [totalDuration, setTotalDuration] = useState(0)
  const [windowStart, setWindowStart] = useState(0)
  const [windowEnd, setWindowEnd] = useState(30)
  const [pushing, setPushing] = useState(false)
  const [voiceOutput, setVoiceOutput] = useState<VoiceOutput | null>(null)
  const [error, setError] = useState<string | null>(null)

  const showError = useCallback((msg: string) => {
    setError(msg)
    setTimeout(() => setError(null), 8000)
  }, [])

  async function handleScrape() {
    if (!companyUrl.trim()) return
    setScraping(true)
    setError(null)
    setExecutives([])
    setSelectedExec(null)
    setMediaResults([])
    setAudioBase64(undefined)
    setVoiceOutput(null)

    try {
      let url = companyUrl.trim()
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) { showError(data.error ?? 'Scrape failed'); return }
      setExecutives(data.executives ?? [])
      setCurrentStep(2)
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setScraping(false)
    }
  }

  async function handleSelectExec(exec: Executive) {
    setSelectedExec(exec)
    setSearching(true)
    setMediaResults([])
    setSelectedUrl(undefined)
    setAudioBase64(undefined)
    setVoiceOutput(null)
    setError(null)

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: exec.name, title: exec.title, companyUrl }),
      })
      const data = await res.json()
      if (!res.ok) { showError(data.error ?? 'Search failed'); return }
      setMediaResults(data.results ?? [])
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSearching(false)
    }
  }

  function handleAddManual(url: string) {
    const manual: MediaResult = {
      title: `Manual: ${url}`,
      url,
      source: (() => { try { return new URL(url).hostname } catch { return url } })(),
      type: url.includes('youtube') ? 'youtube' : 'other',
    }
    setMediaResults((prev) => prev.some(r => r.url === url) ? prev : [...prev, manual])
    setSelectedUrl(url)
  }

  async function handleProcessAudio() {
    if (!selectedUrl || !selectedExec) return
    setProcessing(true)
    setAudioBase64(undefined)
    setDiarization(null)
    setVoiceOutput(null)
    setError(null)
    setCurrentStep(3)

    try {
      const res = await fetch('/api/voice/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: selectedUrl, executiveName: selectedExec.name }),
      })
      const data = await res.json()
      if (!res.ok) { showError(data.error ?? 'Audio processing failed'); return }
      setAudioBase64(data.audioBase64)
      setDiarization(data.diarization ?? null)
      setSessionId(data.sessionId)
      setTotalDuration(data.totalDuration ?? 0)
      setWindowStart(data.windowStart ?? 0)
      setWindowEnd(data.windowEnd ?? 30)
      setCurrentStep(4)
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setProcessing(false)
    }
  }

  async function handleReextract(startSec: number, durationSec: number) {
    if (!sessionId) return
    setError(null)
    try {
      const res = await fetch('/api/voice/reextract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, startSec, durationSec }),
      })
      const data = await res.json()
      if (!res.ok) { showError(data.error ?? 'Re-extract failed'); return }
      setAudioBase64(data.audioBase64)
      setWindowStart(data.windowStart)
      setWindowEnd(data.windowEnd)
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Network error')
    }
  }

  async function handlePush() {
    if (!audioBase64 || !selectedExec) return
    setPushing(true)
    setError(null)

    try {
      const res = await fetch('/api/voice/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          executiveName: selectedExec.name,
          role: selectedExec.title,
          language: mediaResults.find(r => r.url === selectedUrl)?.language ?? 'en',
        }),
      })
      const data = await res.json()
      if (!res.ok) { showError(data.error ?? 'Voice push failed'); return }
      setVoiceOutput(data.output)
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-subtle, #151b42)', border: '1px solid #2e3a6e' }}>
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide text-white">EXEC VOICE REPLIC8</h1>
              <p className="text-xs hidden sm:block" style={{ color: 'var(--text-3)' }}>Executive Voice ID Platform</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 flex-1 justify-center">
            <button
              onClick={() => setActiveTab('voice')}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={activeTab === 'voice'
                ? { background: 'var(--accent-subtle, #151b42)', border: '1px solid #2e3a6e', color: 'var(--accent)' }
                : { background: 'transparent', border: '1px solid transparent', color: 'var(--text-3)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Voice Extraction
            </button>
            <button
              onClick={() => setActiveTab('avatar')}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={activeTab === 'avatar'
                ? { background: 'var(--accent-subtle, #151b42)', border: '1px solid #2e3a6e', color: 'var(--accent)' }
                : { background: 'transparent', border: '1px solid transparent', color: 'var(--text-3)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Avatar Generation
            </button>
          </div>

          {/* Status */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs hidden sm:block" style={{ color: 'var(--text-3)' }}>Security Awareness Training</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: '#0d2318', border: '1px solid #14532d', color: '#4ade80' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Active
            </div>
          </div>
        </div>
      </header>

      {activeTab === 'avatar' && <AvatarGeneration />}

      <main className="max-w-5xl mx-auto px-5 py-10" style={activeTab !== 'voice' ? { display: 'none' } : {}}>
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Authorized use only — Security awareness training simulations
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3 text-white">
            Exec Voice Replic8
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: 'var(--text-2)' }}>
            Identify executives, source audio, and generate voice profiles for security training simulations.
          </p>
        </div>

        <StepIndicator current={currentStep} />

        <div className="space-y-4">
          {/* STEP 1 */}
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <StepBadge n={1} current={currentStep} />
              <div>
                <h3 className="font-semibold text-white text-sm">Identify Target Organization</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Enter a company URL to identify executive leadership</p>
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="url"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !scraping && handleScrape()}
                placeholder="https://company.com"
                className="flex-1 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors"
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
              <button
                onClick={handleScrape}
                disabled={scraping || !companyUrl.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: scraping || !companyUrl.trim() ? 'var(--bg-hover)' : 'var(--accent)' }}
              >
                {scraping ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Analyze
                  </>
                )}
              </button>
            </div>
          </Card>

          {/* Executive Results */}
          {(executives.length > 0 || scraping) && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-semibold text-white">
                    {scraping ? 'Scanning for executives...' : `${executives.length} Executive${executives.length !== 1 ? 's' : ''} Found`}
                  </span>
                </div>
                {selectedExec && (
                  <span className="text-xs px-3 py-1 rounded-full font-medium"
                    style={{ background: 'var(--accent-subtle, #151b42)', border: '1px solid #2e3a6e', color: 'var(--accent)' }}>
                    ✓ {selectedExec.name}
                  </span>
                )}
              </div>
              {!scraping && executives.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
                  No executives found — try a different URL.
                </p>
              )}
              <ExecutiveList executives={executives} onSelect={handleSelectExec} selectedName={selectedExec?.name} loading={scraping} />
              {!scraping && executives.length > 0 && !selectedExec && (
                <p className="text-xs text-center mt-4" style={{ color: 'var(--text-3)' }}>
                  Click an executive to begin media sourcing
                </p>
              )}
            </Card>
          )}

          {/* STEP 2 */}
          {currentStep >= 2 && selectedExec && (
            <Card>
              <div className="flex items-center gap-3 mb-5">
                <StepBadge n={2} current={currentStep} />
                <div>
                  <h3 className="font-semibold text-white text-sm">
                    Find Voice Sample — <span style={{ color: 'var(--accent)' }}>{selectedExec.name}</span>
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Select a video or podcast source</p>
                </div>
              </div>

              <MediaSourcer
                executiveName={selectedExec.name}
                results={mediaResults}
                onSelectUrl={(url) => setSelectedUrl(url)}
                selectedUrl={selectedUrl}
                loading={searching}
                onAddManual={handleAddManual}
              />

              {selectedUrl && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>Selected source</p>
                      <p className="text-xs text-white truncate mt-0.5">{selectedUrl}</p>
                    </div>
                    <button
                      onClick={handleProcessAudio}
                      disabled={processing}
                      className="ml-4 flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all flex-shrink-0 disabled:opacity-40"
                      style={{ background: 'var(--accent)' }}
                    >
                      {processing ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Processing...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Extract Audio
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* STEP 3 & 4 */}
          {currentStep >= 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <div className="flex items-center gap-3 mb-5">
                  <StepBadge n={3} current={currentStep} />
                  <div>
                    <h3 className="font-semibold text-white text-sm">Process Voice Sample</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                      {audioBase64 ? `${Math.round(windowEnd - windowStart)}s clip · move window to re-select` : 'Extract clip for cloning'}
                    </p>
                  </div>
                </div>

                {sessionId && totalDuration > 0 ? (
                  <AudioTimeline
                    audioBase64={audioBase64}
                    totalDuration={totalDuration}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    sessionId={sessionId}
                    executiveName={selectedExec?.name}
                    onReextract={handleReextract}
                    loading={processing}
                  />
                ) : (
                  <VoiceProcessor
                    audioBase64={audioBase64}
                    diarization={diarization as { speakers?: number | null; utterances?: Array<{ speaker: string; text: string; start: number; end: number }>; text?: string } | null}
                    processing={processing}
                    onPush={handlePush}
                    pushing={pushing}
                  />
                )}

                {audioBase64 && sessionId && (
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <VoiceProcessor
                      audioBase64={audioBase64}
                      diarization={diarization as { speakers?: number | null; utterances?: Array<{ speaker: string; text: string; start: number; end: number }>; text?: string } | null}
                      processing={processing}
                      onPush={handlePush}
                      pushing={pushing}
                      hideAudio
                    />
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex items-center gap-3 mb-5">
                  <StepBadge n={4} current={currentStep} />
                  <div>
                    <h3 className="font-semibold text-white text-sm">Voice ID Output</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Voice profile ready for simulation</p>
                  </div>
                </div>

                <JSONOutput output={voiceOutput} />

                {voiceOutput && (
                  <div className="mt-4 rounded-lg p-4" style={{ background: '#0d2318', border: '1px solid #14532d' }}>
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-xs font-semibold text-green-400">Voice ID Created Successfully</p>
                        <p className="text-xs text-green-600 mt-0.5">
                          {voiceOutput.firstName} {voiceOutput.lastName} · <span className="text-green-400 capitalize">{voiceOutput.provider}</span> ·{' '}
                          ID: <span className="text-green-400 font-mono">{voiceOutput.voiceId.slice(0, 12)}…</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>

        <footer className="mt-16 pt-6 text-center text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}>
          Exec Voice Replic8 — Security Awareness Training Platform — Authorized use only
        </footer>
      </main>
    </div>
  )
}
