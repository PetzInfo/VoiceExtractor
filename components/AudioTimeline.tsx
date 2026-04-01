'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

interface Props {
  audioBase64?: string
  totalDuration: number      // full audio length in seconds
  windowStart: number        // current clip start in seconds
  windowEnd: number          // current clip end in seconds
  sessionId: string
  executiveName?: string
  onReextract: (startSec: number, durationSec: number) => Promise<void>
  loading?: boolean
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export default function AudioTimeline({
  audioBase64,
  totalDuration,
  windowStart,
  windowEnd,
  sessionId,
  executiveName,
  onReextract,
  loading,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const scrubberRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; initialWindowStart: number } | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [pendingStart, setPendingStart] = useState(windowStart)
  const [reextracting, setReextracting] = useState(false)

  const clipDuration = windowEnd - windowStart

  // Reset pending position whenever a new clip arrives
  useEffect(() => {
    setPendingStart(windowStart)
    setCurrentTime(0)
    setIsPlaying(false)
    if (audioRef.current) audioRef.current.pause()
  }, [windowStart, audioBase64])

  // ── Waveform rendering ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !audioBase64) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set pixel-perfect resolution
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const W = rect.width
    const H = rect.height

    ;(async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        const audioCtx = new AudioCtx()
        const decoded = await audioCtx.decodeAudioData(base64ToArrayBuffer(audioBase64))
        await audioCtx.close()

        const data = decoded.getChannelData(0)
        const step = Math.ceil(data.length / W)
        const amp = H / 2

        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = '#080e1f'
        ctx.fillRect(0, 0, W, H)

        // Centre line
        ctx.strokeStyle = '#1e2a4a'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, amp)
        ctx.lineTo(W, amp)
        ctx.stroke()

        // Waveform bars
        for (let x = 0; x < W; x++) {
          let min = 0, max = 0
          for (let j = 0; j < step; j++) {
            const v = data[x * step + j] ?? 0
            if (v < min) min = v
            if (v > max) max = v
          }
          const barH = Math.max(1, (max - min) * amp)
          const yTop = amp + min * amp
          const grad = ctx.createLinearGradient(x, yTop, x, yTop + barH)
          grad.addColorStop(0, '#4f8ef7')
          grad.addColorStop(1, '#1d4ed8')
          ctx.fillStyle = grad
          ctx.fillRect(x, yTop, 1, barH)
        }
      } catch (err) {
        console.warn('[AudioTimeline] Waveform decode error:', err)
      }
    })()
  }, [audioBase64])

  // ── Drag / scrubber logic ─────────────────────────────────────────────────

  const handleScrubberMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = scrubberRef.current?.getBoundingClientRect()
    if (!rect || !totalDuration) return
    const clickX = e.clientX - rect.left
    const winLeft = (pendingStart / totalDuration) * rect.width
    const winWidth = (clipDuration / totalDuration) * rect.width
    // Only start a drag when clicking on the window handle (±8px tolerance)
    if (clickX >= winLeft - 8 && clickX <= winLeft + winWidth + 8) {
      dragRef.current = { startX: e.clientX, initialWindowStart: pendingStart }
      e.preventDefault()
    }
  }, [pendingStart, clipDuration, totalDuration])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || !scrubberRef.current || !totalDuration) return
    const rect = scrubberRef.current.getBoundingClientRect()
    const deltaSec = ((e.clientX - dragRef.current.startX) / rect.width) * totalDuration
    const newStart = Math.max(0, Math.min(totalDuration - clipDuration, dragRef.current.initialWindowStart + deltaSec))
    setPendingStart(newStart)
  }, [totalDuration, clipDuration])

  const handleMouseUp = useCallback(() => { dragRef.current = null }, [])

  // Click anywhere on timeline to centre the window there
  const handleScrubberClick = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) return
    const rect = scrubberRef.current?.getBoundingClientRect()
    if (!rect || !totalDuration) return
    const clickSec = ((e.clientX - rect.left) / rect.width) * totalDuration
    const newStart = Math.max(0, Math.min(totalDuration - clipDuration, clickSec - clipDuration / 2))
    setPendingStart(newStart)
  }, [totalDuration, clipDuration])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // ── Re-extract ────────────────────────────────────────────────────────────

  async function handleReextract() {
    setReextracting(true)
    try {
      await onReextract(pendingStart, clipDuration)
    } finally {
      setReextracting(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const pendingChanged = Math.abs(pendingStart - windowStart) > 0.5
  const windowLeftPct = totalDuration > 0 ? (pendingStart / totalDuration) * 100 : 0
  const windowWidthPct = totalDuration > 0 ? (clipDuration / totalDuration) * 100 : 0
  const committedLeftPct = totalDuration > 0 ? (windowStart / totalDuration) * 100 : 0

  // Sensible time marker intervals
  const markerInterval =
    totalDuration > 7200 ? 1800 :
    totalDuration > 3600 ? 600 :
    totalDuration > 1800 ? 300 :
    totalDuration > 600  ? 120 : 60
  const markers: number[] = []
  for (let t = 0; t <= totalDuration; t += markerInterval) markers.push(t)

  const audioSrc = audioBase64 ? `data:audio/mpeg;base64,${audioBase64}` : undefined

  return (
    <div className="space-y-3">

      {/* ── Waveform canvas ── */}
      <div className="relative rounded-lg overflow-hidden" style={{ background: '#080e1f', border: '1px solid var(--border)' }}>
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: 72, display: 'block' }}
        />

        {/* Playback cursor */}
        {audioBase64 && clipDuration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px pointer-events-none"
            style={{
              left: `${(currentTime / clipDuration) * 100}%`,
              background: 'rgba(255,255,255,0.55)',
              transition: 'left 0.1s linear',
            }}
          />
        )}

        {/* Controls overlay */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <button
            onClick={() => {
              const audio = audioRef.current
              if (!audio) return
              isPlaying ? audio.pause() : audio.play()
            }}
            disabled={!audioBase64 || loading}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-30 hover:scale-110"
            style={{ background: 'rgba(59,130,246,0.7)', border: '1px solid rgba(99,160,255,0.9)', boxShadow: '0 0 8px rgba(59,130,246,0.5)' }}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
              {formatTime(currentTime)} / {formatTime(clipDuration)}
            </span>
            <button
              onClick={() => {
                if (!audioBase64) return
                const a = document.createElement('a')
                const slug = (executiveName ?? 'voice_sample').replace(/\s+/g, '_').toLowerCase()
                a.href = `data:audio/mpeg;base64,${audioBase64}`
                a.download = `${slug}_${Math.round(windowStart)}s.mp3`
                a.click()
              }}
              disabled={!audioBase64 || loading}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
              style={{ background: 'rgba(59,130,246,0.25)', border: '1px solid rgba(59,130,246,0.45)' }}
              title="Download clip as MP3"
            >
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Processing…
            </div>
          </div>
        )}
      </div>

      {/* Hidden audio element */}
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setCurrentTime(0) }}
        />
      )}

      {/* ── Full-duration timeline scrubber ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            Full timeline · {formatTime(totalDuration)}
          </span>
          <span className="text-xs font-mono" style={{ color: pendingChanged ? '#fbbf24' : 'var(--text-3)' }}>
            {formatTime(pendingStart)} – {formatTime(pendingStart + clipDuration)}
            {pendingChanged && <span className="ml-1 opacity-70">(pending)</span>}
          </span>
        </div>

        <div
          ref={scrubberRef}
          className="relative rounded-lg select-none"
          style={{ height: 44, background: '#080e1f', border: '1px solid var(--border)', cursor: 'pointer' }}
          onMouseDown={handleScrubberMouseDown}
          onClick={handleScrubberClick}
        >
          {/* Time markers */}
          {markers.map(t => (
            <div
              key={t}
              className="absolute top-0 pointer-events-none flex flex-col items-start"
              style={{ left: `${(t / totalDuration) * 100}%` }}
            >
              <div style={{ width: 1, height: 8, background: '#1e2a4a' }} />
              <span style={{ fontSize: 9, color: '#334155', whiteSpace: 'nowrap', marginTop: 1, marginLeft: 2 }}>
                {formatTime(t)}
              </span>
            </div>
          ))}

          {/* Committed window ghost (shown only while dragging away) */}
          {pendingChanged && (
            <div
              className="absolute top-1.5 bottom-1.5 rounded pointer-events-none"
              style={{
                left: `${committedLeftPct}%`,
                width: `${windowWidthPct}%`,
                background: 'rgba(59,130,246,0.08)',
                border: '1px dashed rgba(59,130,246,0.25)',
              }}
            />
          )}

          {/* Pending / active window */}
          <div
            className="absolute top-1.5 bottom-1.5 rounded"
            style={{
              left: `${windowLeftPct}%`,
              width: `${windowWidthPct}%`,
              background: pendingChanged ? 'rgba(251,191,36,0.18)' : 'rgba(59,130,246,0.22)',
              border: `1px solid ${pendingChanged ? '#fbbf24' : 'rgba(59,130,246,0.55)'}`,
              cursor: 'grab',
            }}
          >
            {/* Grip lines */}
            <div className="absolute inset-0 flex items-center justify-center gap-0.5 pointer-events-none">
              {[0, 1, 2].map(i => (
                <div key={i} className="rounded-full" style={{ width: 1, height: 10, background: pendingChanged ? '#fbbf24' : '#3b82f6', opacity: 0.55 }} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer: hint + re-extract button */}
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Drag or click the timeline to move the {Math.round(clipDuration)}s window
          </p>
          {pendingChanged && (
            <button
              onClick={handleReextract}
              disabled={reextracting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40 flex-shrink-0"
              style={{ background: '#92400e', border: '1px solid #d97706' }}
            >
              {reextracting ? (
                <>
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Re-extracting…
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  Use {formatTime(pendingStart)}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
