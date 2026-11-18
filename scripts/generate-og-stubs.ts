/**
 * Write the per-district share stubs into the frontend build (#2304).
 *
 * Runs after `vite build` (root `build:frontend`), so PR previews and the
 * release deploy both ship them. Reads the district list from the build's
 * CDN (`VITE_CDN_BASE_URL`) `v1/rankings.json`, and writes
 * `frontend/dist/district/<id>.html` per district (scripts/lib/ogStubs.ts).
 *
 * CDN target (#2982): CI (`CI=true`) must set `VITE_CDN_BASE_URL`; with no
 * target the script exits 2, so a staging or preview build can't quietly
 * write stubs from prod data. Local `npm run build:frontend` keeps working
 * for contributors: with no target it logs a stderr line and uses the prod
 * CDN. Every build step in .github/workflows sets it (guard:
 * cdnTargetWorkflowGuard.test.ts).
 *
 * Soft on the district list: if it cannot be read, the build still succeeds
 * with no stubs (every route keeps the generic card) and a ::warning:: says
 * so. A missing dist/index.html is a hard failure: the build did not run.
 *
 * Env (tests and local runs):
 *   OG_STUBS_DIST           dist directory (default frontend/dist)
 *   OG_STUBS_RANKINGS_FILE  read the rankings from this file, not the CDN
 *
 * Logs go to stderr (R4).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveBuildCdnTarget } from './lib/cdnTarget'
import {
  buildDistrictStubHtml,
  districtIdsFromRankings,
  districtStubPath,
} from './lib/ogStubs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = process.env['OG_STUBS_DIST'] || join(REPO, 'frontend', 'dist')
const PROD_CDN = 'https://cdn.taverns.red'
const SITE = 'https://ts.taverns.red'

function resolveCdn(): string {
  try {
    const { url, source } = resolveBuildCdnTarget(
      'generate-og-stubs.ts',
      process.env,
      PROD_CDN
    )
    if (source === 'local-default') {
      console.error(
        `[og-stubs] VITE_CDN_BASE_URL is not set; using the prod CDN ${url} (local build). CI must set it.`
      )
    }
    return url
  } catch (err) {
    console.error(`[og-stubs] ${(err as Error).message}`)
    process.exit(2)
  }
}

const CDN = resolveCdn()

async function readRankings(): Promise<unknown> {
  const file = process.env['OG_STUBS_RANKINGS_FILE']
  if (file) return JSON.parse(readFileSync(file, 'utf8'))
  const url = `${CDN.replace(/\/+$/, '')}/v1/rankings.json`
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

async function main(): Promise<void> {
  const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8')

  let ids: string[]
  try {
    ids = districtIdsFromRankings(await readRankings())
  } catch (err) {
    console.error(
      `::warning title=OG stubs::no district list (${(err as Error).message}); no per-district share stubs in this build (#2304)`
    )
    return
  }

  for (const id of ids) {
    const out = join(DIST, districtStubPath(id))
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(
      out,
      buildDistrictStubHtml(indexHtml, {
        districtId: id,
        cdnBaseUrl: CDN,
        siteOrigin: SITE,
      })
    )
  }
  console.error(
    `[og-stubs] wrote ${ids.length} district stubs to ${join(DIST, 'district')} (cards from ${CDN})`
  )
}

main().catch(err => {
  console.error(`[og-stubs] ${(err as Error).message}`)
  process.exit(1)
})
