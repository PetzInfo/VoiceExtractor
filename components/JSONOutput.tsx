'use client'

import React, { useState, useCallback } from 'react'

interface Props {
  output: object | null
}

function syntaxHighlight(json: string): React.ReactNode[] {
  const lines = json.split('\n')
  return lines.map((line, lineIndex) => {
    const parts: React.ReactNode[] = []
    let remaining = line

    let lastIndex = 0
    const regex = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*(?:[eE][+-]?\d+)?(?=\s*[,\}\]]))|(\btrue\b|\bfalse\b|\bnull\b)/g

    let match
    while ((match = regex.exec(remaining)) !== null) {
      // Add plain text before this match
      if (match.index > lastIndex) {
        parts.push(
          <span key={`plain-${lineIndex}-${lastIndex}`} className="text-gray-300">
            {remaining.slice(lastIndex, match.index)}
          </span>
        )
      }

      if (match[1]) {
        // Key (ends with colon)
        const colonIdx = match[1].lastIndexOf(':')
        const keyPart = match[1].slice(0, colonIdx)
        const colonPart = match[1].slice(colonIdx)
        parts.push(
          <span key={`key-${lineIndex}-${match.index}`}>
            <span className="text-red-400">{keyPart}</span>
            <span className="text-gray-300">{colonPart}</span>
          </span>
        )
      } else if (match[2]) {
        // String value
        parts.push(
          <span key={`str-${lineIndex}-${match.index}`} className="text-green-400">
            {match[2]}
          </span>
        )
      } else if (match[3]) {
        // Number
        parts.push(
          <span key={`num-${lineIndex}-${match.index}`} className="text-yellow-400">
            {match[3]}
          </span>
        )
      } else if (match[4]) {
        // Boolean / null
        parts.push(
          <span key={`bool-${lineIndex}-${match.index}`} className="text-blue-400">
            {match[4]}
          </span>
        )
      }

      lastIndex = match.index + match[0].length
    }

    // Remaining text
    if (lastIndex < remaining.length) {
      parts.push(
        <span key={`end-${lineIndex}`} className="text-gray-300">
          {remaining.slice(lastIndex)}
        </span>
      )
    }

    return (
      <div key={lineIndex} className="leading-6">
        {parts.length > 0 ? parts : <span className="text-gray-300">{line}</span>}
      </div>
    )
  })
}

export default function JSONOutput({ output }: Props) {
  const [copied, setCopied] = useState(false)

  const jsonString = output ? JSON.stringify(output, null, 2) : ''

  const handleCopy = useCallback(async () => {
    if (!jsonString) return
    try {
      await navigator.clipboard.writeText(jsonString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for non-secure contexts
      const el = document.createElement('textarea')
      el.value = jsonString
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [jsonString])

  const handleDownload = useCallback(() => {
    if (!jsonString) return
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'voice_clone.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [jsonString])

  if (!output) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-500 text-sm">No output yet. Complete steps 1–4 to generate voice ID.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Voice ID Output
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-400">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download .json
          </button>
        </div>
      </div>

      {/* Code block */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-gray-800 bg-gray-900">
          <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-600" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
          <span className="ml-2 text-xs text-gray-600">voice_clone.json</span>
        </div>
        <pre className="p-4 text-xs font-mono overflow-x-auto leading-6 max-h-96 overflow-y-auto">
          {syntaxHighlight(jsonString)}
        </pre>
      </div>
    </div>
  )
}
