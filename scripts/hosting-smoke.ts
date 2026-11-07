/**
 * Post-deploy core-path smoke for the Hosting auto-rollback (#2492).
 *
 * Every SMOKE_INTERVAL_SECONDS for SMOKE_WINDOW_SECONDS it checks:
 *   - home: 200 and serving the new build's entry asset (when
 *     EXPECTED_INDEX_HTML names the built index.html), and that asset is
 *     200 JavaScript;
 *   - a district page (DISTRICT_PATH, default /district/61): the SPA shell
 *     over HTTP, then rendered in Chromium — a heading, no error page, no
 *     uncaught page error (SMOKE_RENDER=off skips the browser;
 *     SMOKE_CHROMIUM_PATH points it at an installed Chromium);
 *   - the data CDN: CDN_BASE_URL/v1/latest.json parses.
 * SMOKE_FAILURES_TO_FAIL consecutive failed attempts (default 3) fail it at
 * once; otherwise it passes when the window has elapsed.
 *
 * Thin I/O glue: the checks and the verdict are in ./lib/hostingRollback.ts,
 * unit-tested in scripts/lib/__tests__/hostingRollback.test.ts. Logs go to
 * stderr (R4). Always exits 0 after deciding; $GITHUB_OUTPUT carries
 * `healthy`, `started_at`, `finished_at` and `result_file`.
 * Runbook: docs/runbooks/hosting-auto-rollback.md
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkCdnLatest,
  checkDistrictPage,
  checkEntryAsset,
  checkHome,
  checkRender,
  decideSmoke,
  extractEntryAsset,
  type ProbeResult,
  type SmokeAttempt,
} from './lib/hostingRollback.js'

interface Browser {
  newPage(): Promise<Page>
  close(): Promise<void>
}
interface Page {
  on(event: 'pageerror', fn: (err: Error) => void): void
  goto(
    url: string,
    opts: { waitUntil: string; timeout: number }
  ): Promise<unknown>
  waitForSelector(sel: string, opts: { timeout: number }): Promise<unknown>
  locator(sel: string): {
    count(): Promise<number>
    first(): { textContent(): Promise<string | null> }
  }
  close(): Promise<void>
}

const env = (k: string, d: string) => process.env[k] || d
const num = (k: string, d: number) => {
  const v = Number(process.env[k])
  return Number.isFinite(v) && v > 0 ? v : d
}

const BASE_URL = env('BASE_URL', 'https://ts.taverns.red').replace(/\/$/, '')
const CDN_BASE_URL = env('CDN_BASE_URL', 'https://cdn.taverns.red').replace(
  /\/$/,
  ''
)
const DISTRICT_PATH = env('DISTRICT_PATH', '/district/61')
const WINDOW_MS = num('SMOKE_WINDOW_SECONDS', 600) * 1000
const INTERVAL_MS = num('SMOKE_INTERVAL_SECONDS', 30) * 1000
const FAILURES_TO_FAIL = num('SMOKE_FAILURES_TO_FAIL', 3)
const RENDER = env('SMOKE_RENDER', 'on') !== 'off'
const RESULT_FILE = env(
  'RESULT_FILE',
  join(process.env['RUNNER_TEMP'] ?? '/tmp', `hosting-smoke-${Date.now()}.json`)
)
const FETCH_TIMEOUT_MS = 20_000
const RENDER_TIMEOUT_MS = 30_000

function output(key: string, value: string): void {
  const out = process.env['GITHUB_OUTPUT']
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

async function get(
  url: string
): Promise<{ status: number; body: string; type: string | null }> {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'toast-stats-deploy-smoke' },
  })
  return {
    status: res.status,
    body: await res.text(),
    type: res.headers.get('content-type'),
  }
}

/** A probe that threw (network, timeout) is a failed probe, not a crash. */
async function guarded(
  name: ProbeResult['name'],
  fn: () => Promise<ProbeResult>
): Promise<ProbeResult> {
  try {
    return await fn()
  } catch (err) {
    return { name, ok: false, detail: `error: ${String(err)}` }
  }
}

async function render(browser: Browser): Promise<ProbeResult> {
  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(String(err)))
  try {
    await page.goto(`${BASE_URL}${DISTRICT_PATH}?smoke=${Date.now()}`, {
      waitUntil: 'domcontentloaded',
      timeout: RENDER_TIMEOUT_MS,
    })
    await page
      .waitForSelector('h1, [data-testid="error-page"]', {
        timeout: RENDER_TIMEOUT_MS,
      })
      .catch(() => undefined)
    const errorPage =
      (await page.locator('[data-testid="error-page"]').count()) > 0
    const h1 = page.locator('h1')
    const heading =
      (await h1.count()) > 0
        ? ((await h1.first().textContent())?.trim() ?? null)
        : null
    return checkRender({ heading: heading || null, errorPage, pageErrors })
  } finally {
    await page.close()
  }
}

async function attempt(
  expectedEntry: string | null,
  browser: Browser | null
): Promise<ProbeResult[]> {
  const bust = `smoke=${Date.now()}`
  let homeEntry: string | null = null
  const probes: ProbeResult[] = []

  probes.push(
    await guarded('home', async () => {
      const r = await get(`${BASE_URL}/?${bust}`)
      homeEntry = extractEntryAsset(r.body)
      return checkHome(r.status, r.body, expectedEntry)
    })
  )
  if (homeEntry) {
    const entry: string = homeEntry
    probes.push(
      await guarded('entry-asset', async () => {
        const r = await get(`${BASE_URL}${entry}`)
        return checkEntryAsset(r.status, r.type)
      })
    )
  }
  probes.push(
    await guarded('district', async () => {
      const r = await get(`${BASE_URL}${DISTRICT_PATH}?${bust}`)
      return checkDistrictPage(r.status, r.body, homeEntry)
    })
  )
  if (browser) {
    probes.push(await guarded('district-render', () => render(browser)))
  }
  probes.push(
    await guarded('cdn-data', async () => {
      const r = await get(`${CDN_BASE_URL}/v1/latest.json`)
      return checkCdnLatest(r.status, r.body)
    })
  )
  return probes
}

async function launchBrowser(): Promise<Browser | null> {
  if (!RENDER) {
    console.error('SMOKE_RENDER=off — skipping the browser render probe')
    return null
  }
  const pw = (await import('@playwright/test')) as unknown as {
    chromium: { launch(o: { executablePath?: string }): Promise<Browser> }
  }
  // SMOKE_CHROMIUM_PATH: use an already-installed Chromium (local drills).
  const executablePath = process.env['SMOKE_CHROMIUM_PATH'] || undefined
  return pw.chromium.launch({ executablePath })
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main(): Promise<void> {
  const indexHtml = process.env['EXPECTED_INDEX_HTML']
  const expectedEntry = indexHtml
    ? extractEntryAsset(readFileSync(indexHtml, 'utf-8'))
    : null
  if (indexHtml && !expectedEntry) {
    throw new Error(`no entry asset found in ${indexHtml}`)
  }
  const startedAt = new Date()
  output('started_at', startedAt.toISOString())
  console.error(
    `smoke ${BASE_URL} (${DISTRICT_PATH}) + ${CDN_BASE_URL} for ${WINDOW_MS / 1000}s, ` +
      `every ${INTERVAL_MS / 1000}s, fail after ${FAILURES_TO_FAIL} in a row; ` +
      `expected entry: ${expectedEntry ?? '(any)'}`
  )

  const browser = await launchBrowser()
  const attempts: SmokeAttempt[] = []
  let verdict: 'pass' | 'fail' | 'continue' = 'continue'
  try {
    while (verdict === 'continue') {
      const at = Date.now() - startedAt.getTime()
      const probes = await attempt(expectedEntry, browser)
      attempts.push({ at, probes })
      const line = probes.map(p => `${p.ok ? '✓' : '✗'} ${p.name}: ${p.detail}`)
      console.error(`[+${Math.round(at / 1000)}s]\n  ${line.join('\n  ')}`)
      verdict = decideSmoke(attempts, {
        windowMs: WINDOW_MS,
        failuresToFail: FAILURES_TO_FAIL,
      })
      if (verdict === 'continue') await sleep(INTERVAL_MS)
    }
  } finally {
    await browser?.close()
  }

  const finishedAt = new Date().toISOString()
  const failures = attempts
    .slice(-FAILURES_TO_FAIL)
    .flatMap(a => a.probes.filter(p => !p.ok))
    .map(p => `${p.name}: ${p.detail}`)
  const healthy = verdict === 'pass'
  writeFileSync(
    RESULT_FILE,
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        healthy,
        startedAt: startedAt.toISOString(),
        finishedAt,
        attempts: attempts.length,
        failures: healthy ? [] : [...new Set(failures)],
      },
      null,
      2
    )
  )
  output('healthy', String(healthy))
  output('finished_at', finishedAt)
  output('result_file', RESULT_FILE)
  const summary = process.env['GITHUB_STEP_SUMMARY']
  if (summary) {
    appendFileSync(
      summary,
      `- Smoke of ${BASE_URL}: ${healthy ? '✅ healthy' : '❌ failing'} after ` +
        `${attempts.length} attempts (${startedAt.toISOString()} → ${finishedAt})\n`
    )
  }
  console.error(healthy ? 'smoke: healthy' : '::error::smoke: failing')
}

main().catch(err => {
  // No `healthy` output: deploy.yml treats a crashed smoke as a failed one.
  console.error(`::error::hosting-smoke crashed: ${String(err)}`)
  process.exit(1)
})
