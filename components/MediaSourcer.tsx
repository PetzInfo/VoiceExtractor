'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'

export interface MediaResult {
  title: string
  url: string
  source: string
  type: 'youtube' | 'podcast' | 'keynote' | 'other'
  snippet?: string
  language?: string
}

interface Props {
  executiveName: string
  results: MediaResult[]
  onSelectUrl: (url: string) => void
  selectedUrl?: string
  loading?: boolean
  onAddManual: (url: string) => void
}

function TypeBadge({ type }: { type: MediaResult['type'] }) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    youtube:  { label: 'YouTube', bg: '#1a0d0d', color: '#f87171', border: '#7f1d1d' },
    podcast:  { label: 'Podcast', bg: '#130d1a', color: '#c084fc', border: '#581c87' },
    keynote:  { label: 'Keynote', bg: '#0d1a2a', color: '#60a5fa', border: '#1e3a5f' },
    other:    { label: 'Audio',   bg: 'var(--bg-card)', color: 'var(--text-2)', border: 'var(--border)' },
  }
  const s = map[type] ?? map.other
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}

const LANG_LABELS: Record<string, string> = {
  en: '🇬🇧 EN', de: '🇩🇪 DE', fr: '🇫🇷 FR', es: '🇪🇸 ES',
  it: '🇮🇹 IT', pt: '🇵🇹 PT', nl: '🇳🇱 NL',
  zh: '🇨🇳 ZH', ja: '🇯🇵 JA', ko: '🇰🇷 KO',
}

function LangBadge({ lang }: { lang?: string }) {
  if (!lang) return null
  const label = LANG_LABELS[lang] ?? lang.toUpperCase()
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: 'var(--bg-card)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
      {label}
    </span>
  )
}

// Extract YouTube video ID from any YouTube URL format
function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0]
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
  } catch { /* ignore */ }
  return null
}

function MediaThumbnail({ url, type }: { url: string; type: MediaResult['type'] }) {
  const [imgError, setImgError] = useState(false)
  const ytId = getYouTubeId(url)

  // YouTube: use their free thumbnail CDN
  if (ytId && !imgError) {
    return (
      <div className="flex-shrink-0 rounded-md overflow-hidden" style={{ width: 80, height: 45 }}>
        <img
          src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  // Fallback: styled icon tile for podcasts / other platforms
  const iconStyle: Record<string, { bg: string; color: string }> = {
    podcast: { bg: '#130d1a', color: '#c084fc' },
    keynote: { bg: '#0d1a2a', color: '#60a5fa' },
    youtube: { bg: '#1a0d0d', color: '#f87171' },
    other:   { bg: 'var(--bg-card)', color: 'var(--text-3)' },
  }
  const s = iconStyle[type] ?? iconStyle.other

  return (
    <div
      className="flex-shrink-0 rounded-md flex items-center justify-center"
      style={{ width: 80, height: 45, background: s.bg, border: '1px solid var(--border)' }}
    >
      {type === 'podcast' ? (
        <svg className="w-5 h-5" style={{ color: s.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" style={{ color: s.color }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      )}
    </div>
  )
}

// Full-description tooltip — fixed-position so it's never clipped by scroll containers
function SnippetTooltip({ snippet, children }: { snippet: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })

  return (
    <span
      className="block"
      onMouseEnter={(e) => { setCoords({ x: e.clientX, y: e.clientY }); setShow(true) }}
      onMouseMove={(e) => setCoords({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed',
          left: Math.min(coords.x + 12, window.innerWidth - 360),
          top: coords.y - 8,
          transform: 'translateY(-100%)',
          zIndex: 9999,
          maxWidth: 340,
          background: '#1a2035',
          border: '1px solid #2e3a6e',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          color: '#94a3b8',
          lineHeight: 1.6,
          pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {snippet}
        </div>,
        document.body
      )}
    </span>
  )
}

// Small external link button — opens URL in new tab without triggering card selection
function ExternalLinkButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex-shrink-0 p-0.5 rounded transition-opacity opacity-40 hover:opacity-100"
      style={{ color: 'var(--text-2)' }}
      title="Open in new tab"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  )
}

function SkeletonResult() {
  return (
    <div className="animate-pulse flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
      <div className="flex-shrink-0 rounded-md" style={{ width: 80, height: 45, background: 'var(--border)' }} />
      <div className="flex-1 min-w-0 pt-1">
        <div className="h-3.5 rounded w-3/4 mb-2" style={{ background: 'var(--border)' }} />
        <div className="h-3 rounded w-1/2" style={{ background: 'var(--border)' }} />
      </div>
    </div>
  )
}

const TYPE_FILTERS: { type: MediaResult['type'] | 'all'; label: string }[] = [
  { type: 'all',     label: 'All' },
  { type: 'podcast', label: 'Podcast' },
  { type: 'youtube', label: 'YouTube' },
  { type: 'keynote', label: 'Keynote' },
  { type: 'other',   label: 'Other' },
]

export default function MediaSourcer({ executiveName, results, onSelectUrl, selectedUrl, loading, onAddManual }: Props) {
  const [manualUrl, setManualUrl] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<MediaResult['type']>>(new Set())

  function handleAddManual() {
    const trimmed = manualUrl.trim()
    if (!trimmed) return
    try { new URL(trimmed); onAddManual(trimmed); setManualUrl('') }
    catch { alert('Please enter a valid URL') }
  }

  function toggleFilter(type: MediaResult['type']) {
    setActiveFilters(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  const availableTypes = new Set(results.map(r => r.type))
  const filteredResults = activeFilters.size === 0
    ? results
    : results.filter(r => activeFilters.has(r.type))

  return (
    <div className="space-y-3">
      {/* Type filter pills — only rendered once results are available */}
      {!loading && results.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {TYPE_FILTERS.filter(f => f.type === 'all' || availableTypes.has(f.type as MediaResult['type'])).map(f => {
            if (f.type === 'all') {
              const allOff = activeFilters.size === 0
              return (
                <button
                  key="all"
                  onClick={() => setActiveFilters(new Set())}
                  className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: allOff ? 'var(--accent)' : 'var(--bg-hover)',
                    border: `1px solid ${allOff ? 'var(--accent)' : 'var(--border)'}`,
                    color: allOff ? '#fff' : 'var(--text-2)',
                  }}
                >
                  All
                </button>
              )
            }
            const t = f.type as MediaResult['type']
            const active = activeFilters.has(t)
            const colourMap: Record<string, { on: string; border: string }> = {
              podcast: { on: '#7c3aed', border: '#7c3aed' },
              youtube: { on: '#dc2626', border: '#dc2626' },
              keynote: { on: '#2563eb', border: '#2563eb' },
              other:   { on: '#475569', border: '#475569' },
            }
            const c = colourMap[t] ?? colourMap.other
            return (
              <button
                key={t}
                onClick={() => toggleFilter(t)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: active ? c.on : 'var(--bg-hover)',
                  border: `1px solid ${active ? c.border : 'var(--border)'}`,
                  color: active ? '#fff' : 'var(--text-2)',
                }}
              >
                {f.label}
                <span className="ml-1 opacity-60">
                  {results.filter(r => r.type === t).length}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="space-y-2"><SkeletonResult /><SkeletonResult /><SkeletonResult /></div>
      ) : results.length === 0 ? (
        <div className="text-center py-6" style={{ color: 'var(--text-3)' }}>
          <svg className="w-10 h-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--border)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-sm">No media found for {executiveName}.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Paste a URL manually below.</p>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="text-center py-4" style={{ color: 'var(--text-3)' }}>
          <p className="text-sm">No results match the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {filteredResults.map((result, i) => {
            const isSelected = result.url === selectedUrl
            return (
              <button key={i} onClick={() => onSelectUrl(result.url)}
                className="w-full text-left flex items-start gap-3 p-3 rounded-lg transition-all"
                style={{
                  background: 'var(--bg-hover)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = '#2e3a6e' }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
              >
                <MediaThumbnail url={result.url} type={result.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <span className="text-sm text-white font-medium leading-tight line-clamp-2 flex-1">{result.title}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <LangBadge lang={result.language} />
                      <TypeBadge type={result.type} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <p className="text-xs truncate flex-1" style={{ color: 'var(--text-3)' }}>{result.url}</p>
                    <ExternalLinkButton url={result.url} />
                  </div>
                  {result.snippet && (
                    <SnippetTooltip snippet={result.snippet}>
                      <p className="text-xs mt-1 line-clamp-1 cursor-help" style={{ color: 'var(--text-3)' }}>
                        {result.snippet}
                      </p>
                    </SnippetTooltip>
                  )}
                </div>
                {isSelected && (
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>or enter URL manually</span>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
          placeholder="https://youtube.com/watch?v=..."
          className="flex-1 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
        <button
          onClick={handleAddManual}
          disabled={!manualUrl.trim()}
          className="text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0 disabled:opacity-40"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          Add
        </button>
      </div>
    </div>
  )
}
