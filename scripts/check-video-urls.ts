#!/usr/bin/env tsx
/**
 * check-video-urls — confirm every how-to video the /videos page lists is
 * live on the CDN (#2310).
 *
 * Usage: npm run videos:check-urls, or `node scripts/check-video-urls.ts`
 *
 * Reads the catalogue (frontend/src/content/howToVideos.ts) and requests the
 * first byte of each desktop and mobile MP4. 200 or 206 passes; anything else
 * fails. Prints one JSON result per URL on stdout (R4: diagnostics on stderr)
 * and exits 1 when any URL fails, so run it before adding an entry.
 */
// The .ts extensions let plain `node` (type stripping, no npm install) run
// this file in the post-deploy verify job (#2899).
import { HOW_TO_VIDEOS } from '../frontend/src/content/howToVideos.ts'
import {
  describeFailures,
  probeUrl,
  type VideoUrlResult,
} from './lib/videoUrlCheck.ts'

const checks = HOW_TO_VIDEOS.flatMap(v => [
  { id: v.id, cut: 'desktop' as const, url: v.desktopUrl },
  { id: v.id, cut: 'mobile' as const, url: v.mobileUrl },
])

async function main(): Promise<void> {
  const results: VideoUrlResult[] = await Promise.all(
    checks.map(async c => {
      const status = await probeUrl(c.url)
      return { ...c, status, ok: status === 200 || status === 206 }
    })
  )

  process.stdout.write(JSON.stringify(results, null, 2) + '\n')
  const failed = describeFailures(results)
  if (failed.length > 0) {
    for (const line of failed) console.error(`check-video-urls: ${line}`)
    console.error(
      `check-video-urls: ${failed.length} of ${results.length} URLs are not live`
    )
    process.exit(1)
  }
  console.error(`check-video-urls: all ${results.length} URLs are live`)
}

void main()
