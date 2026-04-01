export type ExecutiveConfidence = 'verified' | 'current' | 'unverified'

export interface Executive {
  name: string
  title: string
  linkedinHint?: string
  linkedinUrl?: string
  confidence?: ExecutiveConfidence
  imageUrl?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseExecutives(text: string): Executive[] {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed.executives)) return parsed.executives
    return []
  } catch {
    console.error('[scraper] JSON parse error:', cleaned.slice(0, 200))
    return []
  }
}

async function claudeClient() {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages
}

// ─── Step 0: Resolve official company name ───────────────────────────────────

export async function resolveCompanyName(companyUrl: string): Promise<string> {
  try {
    const api = await claudeClient()
    const response = await api.create({
      model: 'claude-haiku-4-5',
      max_tokens: 64,
      messages: [{
        role: 'user',
        content: `What is the exact official legal company name for the organisation at this URL: ${companyUrl}
Return ONLY the name, nothing else. Examples: "Siemens AG", "Apple Inc.", "BASF SE", "Volkswagen AG".`,
      }],
    })
    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    console.log(`[resolveCompanyName] "${companyUrl}" → "${raw}"`)
    return raw || new URL(companyUrl).hostname.replace(/^www\./, '').split('.')[0]
  } catch {
    try { return new URL(companyUrl).hostname.replace(/^www\./, '').split('.')[0] } catch { return companyUrl }
  }
}

// ─── Source A: Company's own leadership/board page ────────────────────────────

async function findFromCompanyWebsite(companyUrl: string, officialName: string): Promise<Executive[]> {
  try {
    const domain = new URL(companyUrl).hostname.replace(/^www\./, '')

    // Try common leadership page paths directly first (fast, no Serper cost)
    const candidates = [
      `https://${domain}/en/company/management-board`,
      `https://${domain}/en/about/leadership`,
      `https://${domain}/about/leadership`,
      `https://${domain}/company/leadership`,
      `https://${domain}/en/company/leadership`,
      `https://${domain}/about/management`,
      `https://${domain}/company/management`,
      `https://${domain}/en/investor-relations/corporate-governance/supervisory-board-and-managing-board`,
      `https://www.${domain}/en/company/management-board`,
    ]

    let pageText = ''
    let pageUrl = ''

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ExecutiveBot/1.0)' },
          signal: AbortSignal.timeout(6000),
        })
        if (res.ok) {
          const html = await res.text()
          const text = stripHtml(html)
          if (text.length > 500) {
            pageText = text
            pageUrl = url
            console.log(`[website] Found leadership page: ${url} (${text.length} chars)`)
            break
          }
        }
      } catch { /* try next */ }
    }

    // Fallback: use Serper to find the leadership page
    if (!pageText) {
      const serperKey = process.env.SERPER_API_KEY
      if (serperKey) {
        const searchRes = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': serperKey },
          body: JSON.stringify({
            q: `site:${domain} "management board" OR "executive team" OR "leadership team" OR "board of directors" OR "Vorstand"`,
            num: 3,
          }),
        })
        if (searchRes.ok) {
          const searchData = await searchRes.json()
          const topUrl: string = searchData.organic?.[0]?.link ?? ''
          if (topUrl) {
            try {
              const res = await fetch(topUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ExecutiveBot/1.0)' },
                signal: AbortSignal.timeout(8000),
              })
              if (res.ok) {
                pageText = stripHtml(await res.text())
                pageUrl = topUrl
                console.log(`[website] Serper found leadership page: ${topUrl}`)
              }
            } catch { /* ignore */ }
          }
        }
      }
    }

    if (!pageText) return []

    // Claude extracts executives from the page text
    const api = await claudeClient()
    const response = await api.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Extract the CURRENT top executives of "${officialName}" from this text scraped from their official website (${pageUrl}).

Only include people who hold an active operating role at "${officialName}" ITSELF.
Do NOT include subsidiary CEOs, regional heads, board members without operating roles, or former executives.
Valid roles: CEO, CFO, CTO, COO, CISO, President, Founder, Managing Director, Vorstandsvorsitzender, Finanzvorstand, and equivalents.

Page text:
${pageText.slice(0, 4000)}

Return ONLY valid JSON, no markdown:
{"executives": [{"name": "Full Name", "title": "Job Title", "linkedinHint": "firstname-lastname"}]}
If none found: {"executives": []}`,
      }],
    })
    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const execs = parseExecutives(raw)
    console.log(`[website] Extracted ${execs.length} executives from ${pageUrl}`)
    return execs.map(e => ({ ...e, confidence: 'current' as ExecutiveConfidence }))
  } catch (err) {
    console.warn('[website] Failed:', err)
    return []
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ─── Fallback: Serper search (small companies without a proper leadership page) ─

async function findFromSerperFallback(companyUrl: string, officialName: string): Promise<Executive[]> {
  const serperKey = process.env.SERPER_API_KEY
  if (!serperKey) return []

  const ceoTerms = '"CEO" OR "Chief Executive Officer" OR "Managing Director" OR "Geschäftsführer" OR "Vorstandsvorsitzender" OR "Founder" OR "Gründer"'
  const csuiteTerms = '"CFO" OR "CTO" OR "COO" OR "CISO" OR "Chief Financial" OR "Chief Technology" OR "Finanzvorstand"'

  const fetchSnippets = async (q: string) => {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': serperKey },
        body: JSON.stringify({ q, num: 10 }),
      })
      if (!res.ok) return []
      const data = await res.json()
      return [...(data.organic ?? []), ...(data.news ?? [])]
        .map((item: any) => [item.title, item.snippet].filter(Boolean).join(' — '))
        .filter(Boolean) as string[]
    } catch { return [] }
  }

  const snippets = (await Promise.all([
    fetchSnippets(`"${officialName}" (${ceoTerms})`),
    fetchSnippets(`"${officialName}" (${csuiteTerms})`),
  ])).flat()

  if (snippets.length === 0) return []

  const api = await claudeClient()
  const response = await api.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Extract current top executives of "${officialName}" (${companyUrl}) from these search snippets.
Only include executives of "${officialName}" itself — NOT subsidiaries or similarly named companies.

Snippets:
${snippets.slice(0, 20).join('\n')}

Return ONLY valid JSON, no markdown:
{"executives": [{"name": "Full Name", "title": "Job Title", "linkedinHint": "firstname-lastname"}]}
If none found: {"executives": []}`,
    }],
  })
  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  return parseExecutives(raw).map(e => ({ ...e, confidence: 'current' as ExecutiveConfidence }))
}

// ─── Photo enrichment ─────────────────────────────────────────────────────────

async function fetchExecutivePhoto(exec: Executive, officialName: string, serperKey: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': serperKey },
      body: JSON.stringify({ q: `${exec.name} ${officialName} ${exec.title}`, num: 5 }),
    })
    if (!res.ok) return undefined
    const data = await res.json()
    const images: Array<{ imageUrl?: string; thumbnailUrl?: string; title?: string }> = data.images ?? []
    const blacklist = /logo|icon|diagram|chart|product|building|office|campus/i
    const best = images.find(img => img.thumbnailUrl && !blacklist.test(img.title ?? ''))
    return best?.thumbnailUrl ?? images[0]?.thumbnailUrl
  } catch { return undefined }
}

async function enrichWithPhotos(executives: Executive[], officialName: string): Promise<Executive[]> {
  const serperKey = process.env.SERPER_API_KEY
  if (!serperKey || executives.length === 0) return executives
  const photos = await Promise.allSettled(
    executives.map(e => fetchExecutivePhoto(e, officialName, serperKey))
  )
  return executives.map((exec, i) => ({
    ...exec,
    imageUrl: photos[i].status === 'fulfilled' ? (photos[i] as PromiseFulfilledResult<string | undefined>).value : undefined,
  }))
}

// ─── LinkedIn enrichment ──────────────────────────────────────────────────────

async function fetchLinkedInUrl(exec: Executive, officialName: string, serperKey: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': serperKey },
      body: JSON.stringify({
        q: `site:linkedin.com/in "${exec.name}" "${officialName}"`,
        num: 5,
      }),
    })
    if (!res.ok) return undefined
    const data = await res.json()

    // Split name into parts for matching — require both first and last name to appear
    // in the result title to avoid mismatches (e.g. same last name, different person)
    const nameParts = exec.name.toLowerCase().trim().split(/\s+/).filter(Boolean)
    const firstName = nameParts[0] ?? ''
    const lastName = nameParts[nameParts.length - 1] ?? ''

    for (const result of (data.organic ?? [])) {
      const link: string = result.link ?? ''
      const title: string = (result.title ?? '').toLowerCase()

      // Must be a real profile URL, not a search/directory page
      if (!/linkedin\.com\/in\/[^/?]+\/?$/.test(link)) continue

      // LinkedIn titles look like "First Last - Title at Company | LinkedIn"
      // Both first and last name must appear in the title
      if (!title.includes(firstName) || !title.includes(lastName)) continue

      return link
    }

    return undefined
  } catch { return undefined }
}

async function enrichWithLinkedIn(executives: Executive[], officialName: string): Promise<Executive[]> {
  const serperKey = process.env.SERPER_API_KEY
  if (!serperKey || executives.length === 0) return executives
  const results = await Promise.allSettled(
    executives.map(e => fetchLinkedInUrl(e, officialName, serperKey))
  )
  return executives.map((exec, i) => ({
    ...exec,
    linkedinUrl: results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<string | undefined>).value : undefined,
  }))
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function findExecutives(companyUrl: string): Promise<Executive[]> {
  // 1. Resolve exact official company name (deterministic anchor for all queries)
  const officialName = await resolveCompanyName(companyUrl)
  console.log(`[findExecutives] Official name: "${officialName}"`)

  // 2. Try the company's own leadership/board page (primary source)
  let executives = await findFromCompanyWebsite(companyUrl, officialName)
  console.log(`[findExecutives] Website: ${executives.length} executives`)

  // 3. If website returned nothing → fall back to Serper search snippets
  if (executives.length === 0) {
    console.log('[findExecutives] Website empty — trying Serper fallback')
    executives = await findFromSerperFallback(companyUrl, officialName)
  }

  console.log(`[findExecutives] Final: ${executives.length} executives`)

  // 4. Enrich with headshots + LinkedIn URLs in parallel (best-effort)
  const [withPhotos, withLinkedIn] = await Promise.all([
    enrichWithPhotos(executives, officialName),
    enrichWithLinkedIn(executives, officialName),
  ])

  // Merge the two enrichment results back together
  return withPhotos.map((exec, i) => ({ ...exec, linkedinUrl: withLinkedIn[i]?.linkedinUrl }))
}
