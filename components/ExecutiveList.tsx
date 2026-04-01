'use client'

type ExecutiveConfidence = 'verified' | 'current' | 'unverified'

interface Executive {
  name: string
  title: string
  linkedinHint?: string
  linkedinUrl?: string
  confidence?: ExecutiveConfidence
  imageUrl?: string
}

function Avatar({ name, imageUrl, badge }: { name: string; imageUrl?: string; badge: { color: string; bg: string } }) {
  const initials = name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  if (imageUrl) {
    return (
      <div className="relative flex-shrink-0">
        <img
          src={imageUrl}
          alt={name}
          className="w-12 h-12 rounded-full object-cover object-top"
          style={{ border: `2px solid ${badge.color}22` }}
          onError={(e) => {
            // On load error fall back to initials
            const el = e.currentTarget as HTMLImageElement
            el.style.display = 'none'
            const parent = el.parentElement
            if (parent) {
              const fallback = parent.querySelector('.avatar-fallback') as HTMLElement
              if (fallback) fallback.style.display = 'flex'
            }
          }}
        />
        <div
          className="avatar-fallback w-12 h-12 rounded-full items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ display: 'none', background: badge.bg, color: badge.color, border: `2px solid ${badge.color}44` }}
        >
          {initials}
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
      style={{ background: badge.bg, color: badge.color, border: `2px solid ${badge.color}44` }}
    >
      {initials}
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence?: ExecutiveConfidence }) {
  if (!confidence || confidence === 'verified') return (
    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#4ade80' }}>
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      Verified
    </span>
  )
  if (confidence === 'current') return (
    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#60a5fa' }}>
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
      Current
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#fbbf24' }}>
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      Unverified
    </span>
  )
}

interface Props {
  executives: Executive[]
  onSelect: (exec: Executive) => void
  selectedName?: string
  loading?: boolean
}

function getRoleBadge(title: string): { label: string; bg: string; color: string; border: string } {
  const t = title.toUpperCase()
  if (t.includes('CEO') || t.includes('CHIEF EXECUTIVE'))
    return { label: 'CEO', bg: '#1a0d0d', color: '#f87171', border: '#7f1d1d' }
  if (t.includes('CTO') || t.includes('CHIEF TECHNOLOGY'))
    return { label: 'CTO', bg: '#0d1a2a', color: '#60a5fa', border: '#1e3a5f' }
  if (t.includes('CFO') || t.includes('CHIEF FINANCIAL'))
    return { label: 'CFO', bg: '#0d1a12', color: '#4ade80', border: '#14532d' }
  if (t.includes('COO') || t.includes('CHIEF OPERATING'))
    return { label: 'COO', bg: '#1a1500', color: '#fbbf24', border: '#713f12' }
  if (t.includes('CISO') || t.includes('CHIEF INFORMATION SECURITY'))
    return { label: 'CISO', bg: '#1a0d00', color: '#fb923c', border: '#7c2d12' }
  if (t.includes('CIO') || t.includes('CHIEF INFORMATION'))
    return { label: 'CIO', bg: '#0d1a1a', color: '#22d3ee', border: '#164e63' }
  if (t.includes('CMO') || t.includes('CHIEF MARKETING'))
    return { label: 'CMO', bg: '#1a0d1a', color: '#e879f9', border: '#701a75' }
  if (t.includes('PRESIDENT'))
    return { label: 'PRES', bg: '#1a0d0d', color: '#f87171', border: '#7f1d1d' }
  if (t.includes('VP') || t.includes('VICE PRESIDENT'))
    return { label: 'VP', bg: '#130d1a', color: '#c084fc', border: '#581c87' }
  return { label: 'EXEC', bg: '#130d1a', color: '#c084fc', border: '#581c87' }
}

function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 animate-pulse" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="h-4 rounded w-2/3" style={{ background: 'var(--border)' }} />
        <div className="h-5 rounded w-12" style={{ background: 'var(--border)' }} />
      </div>
      <div className="h-3 rounded w-1/2" style={{ background: 'var(--border)' }} />
    </div>
  )
}

export default function ExecutiveList({ executives, onSelect, selectedName, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    )
  }

  if (executives.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {executives.map((exec, i) => {
        const badge = getRoleBadge(exec.title)
        const isSelected = exec.name === selectedName
        return (
          <button
            key={i}
            onClick={() => onSelect(exec)}
            className="text-left rounded-xl p-4 transition-all cursor-pointer group"
            style={{
              background: isSelected ? 'var(--bg-hover)' : 'var(--bg-hover)',
              border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
              boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
            }}
            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = '#2e3a6e' }}
            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            <div className="flex items-start gap-3 mb-2">
              <Avatar name={exec.name} imageUrl={exec.imageUrl} badge={badge} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-white text-sm leading-tight">{exec.name}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>{exec.title}</p>
                {exec.linkedinHint && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>{exec.linkedinHint}</p>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <ConfidenceBadge confidence={exec.confidence} />
                  {exec.linkedinUrl && (
                    <a
                      href={exec.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="View LinkedIn profile"
                      className="flex items-center gap-1 text-xs font-medium transition-opacity opacity-60 hover:opacity-100"
                      style={{ color: '#60a5fa' }}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            </div>
            {isSelected && (
              <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Selected
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
