'use client'

interface DiarizationData {
  speakers?: number | null
  utterances?: Array<{ speaker: string; text: string; start: number; end: number }>
  text?: string
}

interface Props {
  audioBase64?: string
  diarization?: DiarizationData | null
  processing?: boolean
  onPush: () => void
  pushing?: boolean
  hideAudio?: boolean  // suppress the waveform/player when AudioTimeline is shown above
}

function AudioWaveform() {
  // Static decorative waveform SVG
  const bars = [3, 8, 5, 12, 7, 15, 10, 18, 12, 20, 14, 18, 10, 15, 8, 12, 6, 9, 4, 7, 11, 16, 13, 19, 15, 22, 18, 20, 16, 14, 11, 8, 13, 17, 12, 9, 6, 11, 8, 5]

  return (
    <div className="flex items-center justify-center gap-0.5 h-16 px-4">
      {bars.map((h, i) => (
        <div
          key={i}
          className="bg-red-500 rounded-full opacity-70"
          style={{
            width: '3px',
            height: `${h}px`,
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  )
}

export default function VoiceProcessor({
  audioBase64,
  diarization,
  processing,
  onPush,
  pushing,
  hideAudio = false,
}: Props) {
  const isReady = !!audioBase64

  return (
    <div className="space-y-5">
      {/* Audio visualization — hidden when AudioTimeline is shown instead */}
      {!hideAudio && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Voice Sample
              </span>
              {isReady && (
                <span className="text-xs bg-green-950 border border-green-800 text-green-400 px-2 py-0.5 rounded-full">
                  Ready
                </span>
              )}
            </div>

            {processing ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <svg className="animate-spin w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <div className="text-center">
                  <p className="text-sm text-gray-300">Processing audio...</p>
                  <p className="text-xs text-gray-500 mt-1">Downloading and trimming voice sample</p>
                </div>
              </div>
            ) : isReady ? (
              <>
                <AudioWaveform />
                <div className="mt-2">
                  <audio controls className="w-full h-8 opacity-70" src={`data:audio/mpeg;base64,${audioBase64}`} />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-600">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-sm">No audio processed yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Diarization info */}
      {diarization && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Speaker Analysis
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-white">
                {diarization.speakers ?? '?'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Speakers Detected</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-white">
                {diarization.utterances?.length ?? 0}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Utterances</p>
            </div>
          </div>
          {diarization.text && (
            <p className="mt-3 text-xs text-gray-500 line-clamp-3 italic">
              &ldquo;{diarization.text}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Provider info */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-500 space-y-1">
        <p><span className="text-gray-400">Provider:</span> Cartesia Sonic Voice Cloning</p>
        <p><span className="text-gray-400">Endpoint:</span> api.cartesia.ai/tts/bytes</p>
        <p><span className="text-gray-400">Model:</span> Sonic (multilingual)</p>
      </div>

      {/* Push button */}
      <button
        onClick={onPush}
        disabled={!isReady || pushing || processing}
        className="w-full bg-red-700 hover:bg-red-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {pushing ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Creating Voice ID...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Create Voice ID
          </>
        )}
      </button>
    </div>
  )
}
