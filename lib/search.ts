export interface MediaResult {
  title: string
  url: string
  source: string
  type: 'youtube' | 'podcast' | 'keynote' | 'other'
  snippet?: string
  language?: string  // ISO 639-1 code, e.g. 'en', 'de', 'fr'
}

// Stopword-based language detector — fast, no API needed
const LANG_STOPWORDS: Record<string, string[]> = {
  en: ['the', 'is', 'are', 'was', 'were', 'with', 'this', 'that', 'from', 'have', 'how', 'about', 'will', 'his', 'her', 'our', 'their'],
  de: ['der', 'die', 'das', 'und', 'ist', 'von', 'für', 'mit', 'auf', 'nicht', 'wie', 'dem', 'bei', 'sich', 'auch', 'wird', 'über', 'des'],
  fr: ['les', 'des', 'une', 'dans', 'est', 'que', 'sur', 'par', 'pas', 'avec', 'pour', 'qui', 'plus', 'son', 'ses', 'nous', 'vous', 'leur'],
  es: ['los', 'las', 'una', 'que', 'con', 'por', 'del', 'este', 'pero', 'como', 'más', 'sus', 'hay', 'son', 'nos', 'fue', 'era'],
  it: ['della', 'delle', 'degli', 'che', 'per', 'con', 'una', 'nel', 'dal', 'sul', 'sono', 'questa', 'questo', 'loro', 'tra'],
  pt: ['uma', 'são', 'para', 'com', 'por', 'mas', 'seu', 'sua', 'mais', 'nos', 'foi', 'era', 'ele', 'ela', 'dos'],
  nl: ['het', 'een', 'van', 'zijn', 'dat', 'voor', 'met', 'niet', 'als', 'ook', 'bij', 'uit', 'dit', 'maar', 'aan'],
  zh: ['的', '是', '在', '了', '和', '有', '这', '我', '他', '们', '不', '就'],
  ja: ['の', 'は', 'を', 'が', 'に', 'で', 'と', 'も', 'な', 'た', 'から'],
  ko: ['의', '은', '는', '이', '가', '에', '을', '를', '도', '으로', '로'],
}

function detectLanguage(text: string): string {
  const lower = text.toLowerCase()
  const wordSet = new Set(lower.split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/).filter(Boolean))

  let bestLang = 'en'
  let bestScore = 0

  for (const [lang, stopwords] of Object.entries(LANG_STOPWORDS)) {
    const score = stopwords.filter((w) => wordSet.has(w)).length
    if (score > bestScore) { bestScore = score; bestLang = lang }
  }

  if (bestLang !== 'en' && bestScore < 2) return 'en'
  return bestLang
}

// Platforms downloadable via yt-dlp (no DRM)
const YTDLP_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'ted.com',
  'vimeo.com',
]

// Podcast hosting platforms — downloaded via RSS feed (no DRM, public MP3s)
const PODCAST_DOMAINS = [
  'buzzsprout.com',
  'libsyn.com',
  'podbean.com',
  'simplecast.com',
  'transistor.fm',
  'captivate.fm',
  'spreaker.com',
  'soundcloud.com',
  'podigee.io',
  'omny.fm',
  'megaphone.fm',
  'acast.com',
  'audioboom.com',
  'podcastone.com',
  'pinecast.com',
  'blubrry.com',
  'anchor.fm',
  'podcasts.google.com',
]

const ALLOWED_DOMAINS = [...YTDLP_DOMAINS, ...PODCAST_DOMAINS]

function inferType(query: string, url: string): MediaResult['type'] {
  if (PODCAST_DOMAINS.some((d) => url.includes(d))) return 'podcast'
  if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')) {
    if (query.includes('keynote')) return 'keynote'
    if (query.includes('podcast')) return 'podcast'
    return 'youtube'
  }
  if (url.includes('ted.com')) return 'keynote'
  return 'other'
}

// Score how well a result matches the executive name — higher = more relevant
function relevanceScore(name: string, title: string, snippet: string): number {
  const nameParts = name.toLowerCase().split(/\s+/).filter((p) => p.length > 1)
  const haystack = `${title} ${snippet}`.toLowerCase()
  return nameParts.filter((p) => haystack.includes(p)).length
}

export async function searchExecutiveMedia(name: string, title: string, companyUrl: string = ''): Promise<MediaResult[]> {
  const serperKey = process.env.SERPER_API_KEY
  if (!serperKey) throw new Error('SERPER_API_KEY not set')

  let companyName = ''
  try {
    companyName = new URL(companyUrl).hostname
      .replace(/^www\./, '')
      .split('.')[0]
  } catch { /* companyUrl may be empty */ }

  const anchor = companyName ? ` "${companyName}"` : ''

  // Podcast hosting sites — split into two groups so Google handles the OR lists better
  const podcastSitesA = 'site:buzzsprout.com OR site:libsyn.com OR site:simplecast.com OR site:acast.com OR site:omny.fm'
  const podcastSitesB = 'site:megaphone.fm OR site:podigee.io OR site:audioboom.com OR site:spreaker.com OR site:podbean.com'

  const queries = [
    // Podcast-first: native hosting platforms (two batches for better Google coverage)
    `"${name}"${anchor} podcast (${podcastSitesA})`,
    `"${name}"${anchor} podcast (${podcastSitesB})`,
    // Broad podcast search — catches any hosting platform not in our explicit list
    `"${name}"${anchor} podcast interview guest`,
    // YouTube podcasts & interviews
    `"${name}"${anchor} podcast interview site:youtube.com`,
    `"${name}"${anchor} keynote OR talk OR speech site:youtube.com`,
  ]

  const allResults: MediaResult[] = []
  const seen = new Set<string>()

  await Promise.all(
    queries.map(async (q) => {
      try {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': serperKey,
          },
          body: JSON.stringify({ q, num: 10 }),
        })

        if (!res.ok) {
          console.warn(`[search] Serper returned ${res.status} for query: ${q}`)
          return
        }

        const data = await res.json()
        const items = [
          ...(data.organic ?? []),
          ...(data.videos ?? []),
          ...(data.news ?? []),
        ]

        console.log(`[search] Query "${q}" → ${items.length} raw results`)

        for (const item of items) {
          const url: string = item.link ?? item.url ?? ''
          if (!url || seen.has(url)) continue

          const allowed = ALLOWED_DOMAINS.some((d) => url.includes(d))
          if (!allowed) continue

          if (url.includes('youtube.com/playlist') || url.includes('youtube.com/podcast') || url.includes('music.youtube.com/podcast')) continue

          seen.add(url)

          let sourceHost = ''
          try { sourceHost = new URL(url).hostname } catch { sourceHost = url }

          const itemTitle: string = item.title ?? ''
          const itemSnippet: string = item.snippet ?? item.description ?? ''

          allResults.push({
            title: itemTitle,
            url,
            source: sourceHost,
            type: inferType(q, url),
            snippet: itemSnippet || undefined,
            language: detectLanguage(`${itemTitle} ${itemSnippet}`),
          })
        }
      } catch (err) {
        console.warn(`[search] Query "${q}" failed:`, err)
      }
    })
  )

  // Sort: podcasts first, then by how prominently the executive's name appears in the title
  const TYPE_PRIORITY: Record<string, number> = { podcast: 0, keynote: 1, youtube: 2, other: 3 }
  allResults.sort((a, b) => {
    const typeDiff = (TYPE_PRIORITY[a.type] ?? 3) - (TYPE_PRIORITY[b.type] ?? 3)
    if (typeDiff !== 0) return typeDiff
    // Within same type: rank by how well the title/snippet matches the executive name
    return relevanceScore(name, b.title, b.snippet ?? '') - relevanceScore(name, a.title, a.snippet ?? '')
  })

  console.log(`[search] Total results after filtering: ${allResults.length}`)
  return allResults.slice(0, 20)
}
