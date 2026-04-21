'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'done' | 'error'

interface StepState {
  label: string
  status: StepStatus
}

const INITIAL_STEPS: StepState[] = [
  { label: 'Generating idle video', status: 'idle' },
  { label: 'Preparing voice', status: 'idle' },
  { label: 'Generating talking-head video', status: 'idle' },
  { label: 'Merging final video', status: 'idle' },
]

const LANGUAGES = [
  { code: 'de', label: 'German' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
]

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-6 ${className}`}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>
      {children}
    </p>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AvatarGeneration() {
  // Identity
  const [avatarName, setAvatarName] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)

  // Voice
  const [voiceId, setVoiceId] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioBase64, setAudioBase64] = useState<string | null>(null)

  // Language
  const [language, setLanguage] = useState('de')

  // Pipeline state
  const [generating, setGenerating] = useState(false)
  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Tracks which media types have already been fetched (ref = no re-render on update)
  const fetchedMedia = useRef({ idle: false, tts: false, heygen: false, final: false })

  // Interim + final media
  const [idleVideo, setIdleVideo] = useState<string | null>(null)
  const [ttsAudio, setTtsAudio] = useState<string | null>(null)
  const [heygenVideo, setHeygenVideo] = useState<string | null>(null)
  const [finalVideo, setFinalVideo] = useState<string | null>(null)

  // Beyond Presence avatar creation
  type BeyState = 'idle' | 'uploading' | 'done' | 'error'
  const [beyState, setBeyState] = useState<BeyState>('idle')
  const [beyAvatarId, setBeyAvatarId] = useState<string | null>(null)
  const [beyError, setBeyError] = useState<string | null>(null)

  const STORAGE_KEY = 'avatar_job_id'

  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  // ── Derived ────────────────────────────────────────────────────────────────

  const hasVoiceId = voiceId.trim().length > 0
  const hasAudio = audioFile !== null
  const canGenerate = !generating && avatarName.trim().length > 0 && image !== null && (hasVoiceId || hasAudio)

  // ── File handlers ─────────────────────────────────────────────────────────

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageError(null)

    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      if (img.width <= img.height) {
        setImageError('Image must be in landscape orientation (wider than tall).')
        URL.revokeObjectURL(url)
        if (imageInputRef.current) imageInputRef.current.value = ''
        return
      }
      // Read as base64
      const reader = new FileReader()
      reader.onload = (ev) => setImageBase64(ev.target?.result as string)
      reader.readAsDataURL(file)

      if (imagePreview) URL.revokeObjectURL(imagePreview)
      setImage(file)
      setImagePreview(url)
    }
    img.src = url
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImage(null)
    setImagePreview(null)
    setImageBase64(null)
    setImageError(null)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  function handleVoiceIdChange(value: string) {
    setVoiceId(value)
    if (value && audioFile) {
      setAudioFile(null)
      setAudioBase64(null)
      if (audioInputRef.current) audioInputRef.current.value = ''
    }
  }

  function handleAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (voiceId) setVoiceId('')

    const reader = new FileReader()
    reader.onload = (ev) => setAudioBase64(ev.target?.result as string)
    reader.readAsDataURL(file)
    setAudioFile(file)
  }

  function clearAudio() {
    setAudioFile(null)
    setAudioBase64(null)
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  function clearVoiceId() {
    setVoiceId('')
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const fetchMedia = useCallback(async (jobId: string, type: 'idle' | 'tts' | 'heygen' | 'final') => {
    if (fetchedMedia.current[type]) return
    fetchedMedia.current[type] = true
    try {
      const res = await fetch(`/api/avatar/media/${jobId}/${type}`)
      if (!res.ok) return
      const { data, mimeType } = await res.json()
      const src = `data:${mimeType};base64,${data}`
      if (type === 'idle')    setIdleVideo(src)
      if (type === 'tts')     setTtsAudio(src)
      if (type === 'heygen')  setHeygenVideo(src)
      if (type === 'final')   setFinalVideo(src)
    } catch { /* non-fatal */ }
  }, [])

  const startPolling = useCallback((jobId: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/avatar/status/${jobId}`)
        if (!res.ok) {
          if (res.status === 404) {
            stopPolling()
            setGenerating(false)
            setPipelineError('Job not found — the server may have restarted.')
            localStorage.removeItem('avatar_job_id')
          }
          return
        }
        const job = await res.json()
        setSteps(job.steps)

        // Fetch each media type exactly once when its flag flips
        if (job.hasIdleVideo)   fetchMedia(jobId, 'idle')
        if (job.hasTtsAudio)    fetchMedia(jobId, 'tts')
        if (job.hasHeygenVideo) fetchMedia(jobId, 'heygen')
        if (job.hasFinalVideo)  fetchMedia(jobId, 'final')

        if (job.status === 'done') {
          stopPolling()
          setGenerating(false)
          localStorage.removeItem('avatar_job_id')
        } else if (job.status === 'error') {
          stopPolling()
          setGenerating(false)
          setPipelineError(job.error ?? 'Pipeline failed')
          localStorage.removeItem('avatar_job_id')
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 3000)
  }, [stopPolling, fetchMedia])

  // On mount: reconnect to any in-progress job from a previous session
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    setActiveJobId(stored)
    setGenerating(true)
    setPipelineError(null)
    setFinalVideo(null)
    setSteps(INITIAL_STEPS)
    startPolling(stored)
    return stopPolling
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Beyond Presence upload ────────────────────────────────────────────────

  async function handleCreateBeyAvatar() {
    if (!activeJobId || !avatarName) return
    setBeyState('uploading')
    setBeyError(null)
    try {
      const res = await fetch('/api/avatar/bey-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: activeJobId, avatarName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setBeyAvatarId(data.avatarId)
      setBeyState('done')
      fetch('https://hook.eu1.make.com/sb8bg8rwpi965yxsuy4hu7eb760r9s3w', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_id: data.avatarId,
          avatar_name: avatarName,
          avatar_status: data.status,
        }),
      }).catch(() => {})
    } catch (err) {
      setBeyError(err instanceof Error ? err.message : 'Unexpected error')
      setBeyState('error')
    }
  }

  // ── Pipeline start ────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!canGenerate || !imageBase64) return
    setGenerating(true)
    setPipelineError(null)
    setIdleVideo(null)
    setTtsAudio(null)
    setHeygenVideo(null)
    setFinalVideo(null)
    setSteps(INITIAL_STEPS)
    fetchedMedia.current = { idle: false, tts: false, heygen: false, final: false }

    try {
      const body: Record<string, string> = { avatarName, imageBase64, language }
      if (hasVoiceId) body.voiceId = voiceId.trim()
      if (hasAudio && audioBase64) body.audioBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '')

      const res = await fetch('/api/avatar/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start job')

      const jobId: string = data.jobId
      setActiveJobId(jobId)
      localStorage.setItem(STORAGE_KEY, jobId)
      startPolling(jobId)
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Unexpected error')
      setGenerating(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      {/* Hero */}
      <div className="text-center mb-12">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Authorized use only — Security awareness training simulations
        </div>
        <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3 text-white">
          Avatar Generation
        </h2>
        <p className="text-base max-w-xl mx-auto" style={{ color: 'var(--text-2)' }}>
          Configure an executive avatar with a portrait and voice profile for simulation.
        </p>
      </div>

      {/* Reconnect notice */}
      {activeJobId && generating && !steps.some(s => s.status !== 'idle') && (
        <div className="mb-6 rounded-xl px-5 py-4 flex items-center gap-3"
          style={{ background: 'var(--bg-card)', border: '1px solid #2e3a6e' }}>
          <svg className="animate-spin w-4 h-4 flex-shrink-0 text-accent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-white">Reconnected to running job</p>
            <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-3)' }}>{activeJobId}</p>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* LEFT — Avatar identity */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--accent)', color: 'white' }}>1</div>
            <div>
              <h3 className="font-semibold text-white text-sm">Avatar Identity</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Name and portrait image</p>
            </div>
          </div>

          {/* Avatar name */}
          <div className="mb-6">
            <SectionLabel>Avatar Name</SectionLabel>
            <input
              type="text"
              value={avatarName}
              onChange={(e) => setAvatarName(e.target.value)}
              placeholder="e.g. Jane Doe"
              disabled={generating}
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors disabled:opacity-50"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Image upload */}
          <div>
            <SectionLabel>Portrait Image (landscape)</SectionLabel>
            {imagePreview ? (
              <div className="relative rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Avatar portrait" className="w-full object-cover" style={{ maxHeight: '180px' }} />
                {!generating && (
                  <button onClick={clearImage}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white transition-colors"
                    style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <div className="px-3 py-2" style={{ background: 'var(--bg-card)' }}>
                  <p className="text-xs text-white truncate">{image?.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{(image!.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={generating}
                className="w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 py-10 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: imageError ? '#7f1d1d' : 'var(--border)', background: 'var(--bg-hover)' }}
                onMouseEnter={e => { if (!generating) (e.currentTarget as HTMLElement).style.borderColor = imageError ? '#ef4444' : 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = imageError ? '#7f1d1d' : 'var(--border)' }}
              >
                <svg className="w-8 h-8" style={{ color: 'var(--text-3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-white">Upload portrait</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Landscape orientation required</p>
                </div>
              </button>
            )}
            {imageError && <p className="mt-2 text-xs text-red-400">{imageError}</p>}
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </div>
        </Card>

        {/* RIGHT — Voice configuration */}
        <Card className="flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--accent)', color: 'white' }}>2</div>
            <div>
              <h3 className="font-semibold text-white text-sm">Voice Configuration</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Cartesia Voice ID or audio file, plus language</p>
            </div>
          </div>

          {/* Language selector */}
          <div className="mb-6">
            <SectionLabel>Language</SectionLabel>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={generating}
              className="w-full rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none transition-colors disabled:opacity-50 appearance-none"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Cartesia Voice ID */}
          {!hasAudio && (
            <div className="mb-5">
              <SectionLabel>Cartesia Voice ID</SectionLabel>
              <div className="relative">
                <input
                  type="text"
                  value={voiceId}
                  onChange={(e) => handleVoiceIdChange(e.target.value)}
                  placeholder="e.g. a0e99841-438c-4a64-b679-ae501e7d6091"
                  disabled={generating}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors pr-9 disabled:opacity-50"
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono, monospace)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
                {hasVoiceId && !generating && (
                  <button onClick={clearVoiceId}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* OR divider */}
          {!hasVoiceId && !hasAudio && (
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>or</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>
          )}

          {/* Audio file upload */}
          {!hasVoiceId && (
            <div className="flex-1">
              <SectionLabel>Audio File</SectionLabel>
              {hasAudio ? (
                <div className="rounded-lg px-4 py-3 flex items-center gap-3"
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--accent-subtle, #151b42)', border: '1px solid #2e3a6e' }}>
                    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{audioFile.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{(audioFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  {!generating && (
                    <button onClick={clearAudio} className="text-slate-500 hover:text-white transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => audioInputRef.current?.click()}
                  disabled={generating}
                  className="w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 py-10 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
                  onMouseEnter={e => { if (!generating) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                >
                  <svg className="w-8 h-8" style={{ color: 'var(--text-3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-white">Upload audio file</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>MP3, WAV, M4A, OGG (~5s sample)</p>
                  </div>
                </button>
              )}
              <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioChange} />
            </div>
          )}

          {/* Generate button */}
          <div className="mt-auto pt-6">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: canGenerate ? 'var(--accent)' : 'var(--bg-hover)' }}
            >
              {generating ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Generate Avatar
                </>
              )}
            </button>
          </div>
        </Card>
      </div>

      {/* Progress + output */}
      {(generating || steps.some(s => s.status !== 'idle') || pipelineError) && (
        <Card className="mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--accent)', color: 'white' }}>3</div>
            <div>
              <h3 className="font-semibold text-white text-sm">Pipeline Progress</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                {generating ? 'Processing — this takes ~10–15 minutes' : pipelineError ? 'Failed' : 'Complete'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i}>
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all ${
                    step.status === 'done' ? 'bg-green-600 text-white'
                    : step.status === 'running' ? 'text-white'
                    : 'text-slate-600'
                  }`} style={
                    step.status === 'running' ? { background: 'var(--accent)' }
                    : step.status === 'idle' ? { background: 'var(--bg-hover)', border: '1px solid var(--border)' }
                    : {}
                  }>
                    {step.status === 'done' ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : step.status === 'running' ? (
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : i + 1}
                  </div>
                  {/* Label */}
                  <span className={`text-sm transition-all ${
                    step.status === 'done' ? 'text-green-400'
                    : step.status === 'running' ? 'text-white font-medium'
                    : 'text-slate-600'
                  }`}>{step.label}</span>
                </div>

                {/* Inline media previews */}
                {i === 0 && idleVideo && (
                  <div className="ml-10 mt-2">
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Idle video</p>
                    <video src={idleVideo} controls muted className="rounded-lg w-full" style={{ maxHeight: '180px' }} />
                  </div>
                )}
                {i === 1 && ttsAudio && (
                  <div className="ml-10 mt-2">
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Audio track</p>
                    <audio src={ttsAudio} controls className="w-full" style={{ height: '36px' }} />
                  </div>
                )}
                {i === 2 && heygenVideo && (
                  <div className="ml-10 mt-2">
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Talking-head video</p>
                    <video src={heygenVideo} controls className="rounded-lg w-full" style={{ maxHeight: '180px' }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {pipelineError && (
            <div className="mt-4 rounded-lg px-4 py-3" style={{ background: '#1a0a0a', border: '1px solid #7f1d1d' }}>
              <p className="text-xs font-medium text-red-300">Error</p>
              <p className="text-xs text-red-400 mt-0.5">{pipelineError}</p>
            </div>
          )}
        </Card>
      )}

      {/* Final video output */}
      {finalVideo && (
        <Card>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-white">Training Video Ready</span>
            </div>
            <a
              href={finalVideo}
              download={`${avatarName.replace(/\s+/g, '_')}_training.mp4`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
              style={{ background: 'var(--accent)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </a>
          </div>

          <video
            src={finalVideo}
            controls
            className="w-full rounded-lg mb-6"
            style={{ maxHeight: '480px' }}
          />

          {/* Beyond Presence avatar creation */}
          <div className="pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
              Use this video to train a Beyond Presence avatar. Training takes approximately 5–6 hours.
            </p>

            {beyState === 'idle' && (
              <button
                onClick={handleCreateBeyAvatar}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
                style={{ background: 'var(--accent)' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Create Beyond Presence Avatar
              </button>
            )}

            {beyState === 'uploading' && (
              <div className="flex items-center gap-3">
                <svg className="animate-spin w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-white">Uploading training video to Beyond Presence…</span>
              </div>
            )}

            {beyState === 'done' && beyAvatarId && (
              <div className="rounded-lg px-4 py-3" style={{ background: 'var(--bg-hover)', border: '1px solid #14532d' }}>
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-semibold text-green-400">Avatar training in progress</span>
                </div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>Avatar ID</p>
                <p className="text-xs font-mono text-white break-all">{beyAvatarId}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                  Training has begun and takes approximately 5–6 hours. You will be notified once the avatar is ready.
                </p>
              </div>
            )}

            {beyState === 'error' && (
              <div>
                <div className="rounded-lg px-4 py-3 mb-3" style={{ background: '#1a0a0a', border: '1px solid #7f1d1d' }}>
                  <p className="text-xs font-medium text-red-300">Upload failed</p>
                  <p className="text-xs text-red-400 mt-0.5">{beyError}</p>
                </div>
                <button
                  onClick={handleCreateBeyAvatar}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
                  style={{ background: 'var(--accent)' }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      <footer className="mt-16 pt-6 text-center text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}>
        Exec Voice Replic8 — Security Awareness Training Platform — Authorized use only
      </footer>
    </div>
  )
}
