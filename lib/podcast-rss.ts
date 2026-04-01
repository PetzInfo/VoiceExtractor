import * as fs from 'fs/promises'
import * as fsSync from 'fs'

// Podcast hosting platforms that publish public RSS feeds (no DRM)
export const PODCAST_PLATFORMS = [
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
  'podcastone.com',
  'pinecast.com',
  'whooshkaa.com',
]

export function isPodcastPlatformUrl(url: string): boolean {
  return PODCAST_PLATFORMS.some((d) => url.includes(d))
}

// Platform-specific RSS URL patterns when no <link> tag is found in HTML
function guessRssUrl(pageUrl: string, html: string): string | null {
  try {
    const u = new URL(pageUrl)

    if (u.hostname.includes('buzzsprout.com')) {
      const m = pageUrl.match(/buzzsprout\.com\/(\d+)/)
      if (m) return `https://feeds.buzzsprout.com/${m[1]}.rss`
    }

    if (u.hostname.includes('libsyn.com')) {
      const m = u.hostname.match(/^([^.]+)\.libsyn\.com/)
      if (m) return `https://${m[1]}.libsyn.com/rss`
    }

    if (u.hostname.includes('simplecast.com')) {
      const m = html.match(/feeds\.simplecast\.com\/[\w-]+/)
      if (m) return `https://${m[0]}`
    }

    if (u.hostname.includes('acast.com')) {
      const m = pageUrl.match(/acast\.com\/([^/?]+)/)
      if (m) return `https://feeds.acast.com/${m[1]}`
    }

    if (u.hostname.includes('omny.fm')) {
      const m = pageUrl.match(/omny\.fm\/shows\/([^/?]+)/)
      if (m) return `https://omny.fm/shows/${m[1]}/playlists/podcast.rss`
    }

    if (u.hostname.includes('megaphone.fm')) {
      const m = pageUrl.match(/megaphone\.fm\/channels\/([^/?]+)/)
      if (m) return `https://feeds.megaphone.fm/${m[1]}`
    }

    if (u.hostname.includes('spreaker.com')) {
      const m = html.match(/feeds\.spreaker\.com\/user\/[\w-]+/)
      if (m) return `https://${m[0]}`
    }
  } catch { /* ignore */ }
  return null
}

async function findRssFeedUrl(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PodcastBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // Standard: look for <link type="application/rss+xml" href="...">
    const patterns = [
      /<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/rss\+xml["']/i,
      /<link[^>]+type=["']application\/atom\+xml["'][^>]+href=["']([^"']+)["']/i,
    ]
    for (const pattern of patterns) {
      const m = html.match(pattern)
      if (m) {
        // Resolve relative URLs
        try { return new URL(m[1], pageUrl).href } catch { return m[1] }
      }
    }

    // Platform-specific guessing
    return guessRssUrl(pageUrl, html)
  } catch (err) {
    console.warn('[podcast-rss] Failed to fetch page:', pageUrl, err)
    return null
  }
}

interface RssEpisode {
  title: string
  mp3Url: string
  score: number
}

function parseRssEpisodes(xml: string, executiveName: string): RssEpisode[] {
  const episodes: RssEpisode[] = []
  const nameParts = executiveName.toLowerCase().split(/\s+/).filter((p) => p.length > 2)

  // Match all <item> blocks
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1]

    // Find audio enclosure (mp3 or audio/*)
    const enclosureMatch =
      item.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*(?:type=["']audio[^"']*["'])?/i) ??
      item.match(/url=["']([^"']+\.mp3[^"']*)["']/i)

    if (!enclosureMatch) continue
    const mp3Url = enclosureMatch[1].replace(/&amp;/g, '&')

    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)
    const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)

    const title = titleMatch?.[1]?.trim() ?? ''
    const desc = (descMatch?.[1] ?? '').replace(/<[^>]+>/g, '') // strip HTML
    const combined = `${title} ${desc}`.toLowerCase()

    const score = nameParts.filter((part) => combined.includes(part)).length

    episodes.push({ title, mp3Url, score })
  }

  return episodes
}

// Download an MP3 via HTTP, limited to first ~80 MB to avoid giant files
async function streamDownloadMp3(mp3Url: string, outputPath: string): Promise<void> {
  const MAX_BYTES = 80 * 1024 * 1024 // 80 MB ≈ ~80 min at 128kbps

  const res = await fetch(mp3Url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PodcastBot/1.0)',
      'Range': `bytes=0-${MAX_BYTES - 1}`,
    },
    signal: AbortSignal.timeout(120000),
  })

  if (!res.ok && res.status !== 206) {
    throw new Error(`Failed to download podcast MP3: HTTP ${res.status} from ${mp3Url}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length < 10000) throw new Error('Downloaded podcast MP3 is too small — invalid or gated content')

  await fs.writeFile(outputPath, buffer)
  console.log(`[podcast-rss] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB → ${outputPath}`)
}

export async function downloadPodcastFromRss(
  pageUrl: string,
  executiveName: string,
  outputPath: string
): Promise<void> {
  // 1. Find the RSS feed URL from the podcast page
  const rssUrl = await findRssFeedUrl(pageUrl)
  if (!rssUrl) throw new Error(`No RSS feed found for podcast page: ${pageUrl}`)
  console.log('[podcast-rss] Found RSS feed:', rssUrl)

  // 2. Fetch and parse the RSS feed
  const rssRes = await fetch(rssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PodcastBot/1.0)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!rssRes.ok) throw new Error(`Failed to fetch RSS feed: HTTP ${rssRes.status} from ${rssUrl}`)
  const xml = await rssRes.text()

  // 3. Find the best matching episode (one that mentions the executive by name)
  const episodes = parseRssEpisodes(xml, executiveName)
  if (episodes.length === 0) throw new Error('No audio episodes found in RSS feed')

  // Sort: episodes mentioning executive first, then fall back to most recent (first in feed)
  episodes.sort((a, b) => b.score - a.score)
  const best = episodes[0]

  console.log(
    `[podcast-rss] Best episode (score ${best.score}): "${best.title}" → ${best.mp3Url}`
  )

  // 4. Stream-download the episode MP3
  await streamDownloadMp3(best.mp3Url, outputPath)
}
