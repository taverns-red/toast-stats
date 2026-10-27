#!/usr/bin/env tsx
/**
 * check-video-urls — confirm every how-to video the /videos page lists is
 * live on the CDN (#2310).
 *
 * Usage: npm run videos:check-urls
 *
 * Reads the catalogue (frontend/src/content/howToVideos.ts) and requests the
 * first byte of each desktop and mobile MP4. 200 or 206 passes; anything else
 * fails. Prints one JSON result per URL on stdout (R4: diagnostics on stderr)
 * and exits 1 when any URL fails, so run it before adding an entry.
 */
import { HOW_TO_VIDEOS } from '../frontend/src/content/howToVideos'

interface Result {
  id: string
  cut: 'desktop' | 'mobile'
  url: string
  status: number | null
  ok: boolean
}

async function probe(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } })
    await res.body?.cancel()
    return res.status
  } catch (err) {
    console.error(`check-video-urls: ${url}: ${String(err)}`)
    return null
  }
}

const checks = HOW_TO_VIDEOS.flatMap(v => [
  { id: v.id, cut: 'desktop' as const, url: v.desktopUrl },
  { id: v.id, cut: 'mobile' as const, url: v.mobileUrl },
])

async function main(): Promise<void> {
  const results: Result[] = await Promise.all(
    checks.map(async c => {
      const status = await probe(c.url)
      return { ...c, status, ok: status === 200 || status === 206 }
    })
  )

  process.stdout.write(JSON.stringify(results, null, 2) + '\n')
  const failed = results.filter(r => !r.ok)
  if (failed.length > 0) {
    console.error(
      `check-video-urls: ${failed.length} of ${results.length} URLs are not live`
    )
    process.exit(1)
  }
  console.error(`check-video-urls: all ${results.length} URLs are live`)
}

void main()
