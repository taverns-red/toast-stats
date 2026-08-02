/**
 * Backfill against the LIVE program year (#1384).
 *
 * `BackfillOrchestrator` called `downloadCsv` without `pathStyle`, so
 * `buildExportUrl` fell through to `/{programYear}/export.aspx` — a path that
 * does not exist for the live year (HTTP 500). Four days of real PY 2026-2027
 * data (2026-07-26 → 07-29) were unreachable as a result.
 *
 * These tests drive the orchestrator through a simulator of the real endpoint
 * (see `fakes/dashboardExportSimulator.ts`), so the URL `buildExportUrl`
 * actually produces is what decides pass/fail — the same way it does in prod.
 *
 * The archive direction is the dangerous one: the root path ignores the
 * `~{programYear}` token, so a historical fetch routed there silently returns
 * something other than what was asked for. Those cases are pinned too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BackfillOrchestrator,
  type BackfillConfig,
  type BackfillStorage,
} from '../services/BackfillOrchestrator.js'
import {
  createSimulatedDownloader,
  SIM_LIVE_PROGRAM_YEAR,
  SIM_TODAY,
} from './fakes/dashboardExportSimulator.js'

/** Storage that records every write so we can assert on what got ingested. */
function createSpyStorage(): BackfillStorage & {
  writes: Array<{ path: string; content: string }>
} {
  const writes: Array<{ path: string; content: string }> = []
  return {
    writes,
    async exists() {
      return false
    },
    async read() {
      return ''
    },
    async write(path: string, content: string) {
      writes.push({ path, content })
    },
  }
}

function baseConfig(overrides: Partial<BackfillConfig> = {}): BackfillConfig {
  return {
    startYear: 2026,
    endYear: 2026,
    frequency: 'weekly',
    ratePerSecond: 1000,
    outputDir: '/data/cache',
    ...overrides,
  }
}

describe('BackfillOrchestrator — live program year (#1384)', () => {
  beforeEach(() => {
    // The orchestrator asks the dashboard which program year is live; that
    // question is "as of now", so the clock has to be pinned. Only Date is
    // faked — the rate limiter's timers must stay real.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${SIM_TODAY}T12:00:00Z`))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reaches the live program year at the root path, not /{PY}/ (RED before #1384)', async () => {
    const storage = createSpyStorage()
    const orchestrator = new BackfillOrchestrator(baseConfig({ storage }))
    const sim = createSimulatedDownloader()
    orchestrator.downloader.downloadCsv = sim.downloadCsv

    const result = await orchestrator.runPhase1Discovery()

    // Before the fix every request went to /2026-2027/export.aspx → HTTP 500,
    // so nothing was discovered and nothing was written.
    expect(result.districtsPerYear[SIM_LIVE_PROGRAM_YEAR]).toEqual([
      '61',
      '128',
      'U',
    ])
    expect(storage.writes.length).toBeGreaterThan(0)

    // Not one districtsummary request may carry the archive prefix for the
    // live year — that URL is the 500.
    const archivePrefixed = sim.requestedUrls.filter(u =>
      u.includes(`/${SIM_LIVE_PROGRAM_YEAR}/export.aspx`)
    )
    expect(archivePrefixed).toEqual([])
  })

  it('fetches per-district reports for the live year at the root path too', async () => {
    const storage = createSpyStorage()
    const orchestrator = new BackfillOrchestrator(
      baseConfig({ storage, frequency: 'monthly' })
    )
    const sim = createSimulatedDownloader()
    orchestrator.downloader.downloadCsv = sim.downloadCsv

    const result = await orchestrator.runPhase2Collection({
      [SIM_LIVE_PROGRAM_YEAR]: ['61'],
    })

    expect(result.errors).toBe(0)
    expect(
      sim.requestedUrls.filter(u =>
        u.includes(`/${SIM_LIVE_PROGRAM_YEAR}/export.aspx`)
      )
    ).toEqual([])
    expect(
      storage.writes.filter(w => w.path.endsWith('club-performance.csv')).length
    ).toBeGreaterThan(0)
  })

  it('keeps historical years on /{PY}/ — byte-exact URLs, unchanged', async () => {
    const orchestrator = new BackfillOrchestrator(
      baseConfig({
        startYear: 2024,
        endYear: 2024,
        frequency: 'monthly',
        storage: createSpyStorage(),
      })
    )
    const sim = createSimulatedDownloader()
    orchestrator.downloader.downloadCsv = sim.downloadCsv

    await orchestrator.runPhase1Discovery()

    expect(sim.requestedUrls.length).toBeGreaterThan(0)
    for (const url of sim.requestedUrls) {
      expect(url).toMatch(
        /^https:\/\/dashboards\.toastmasters\.org\/2024-2025\/export\.aspx\?/
      )
    }
    // The exact first URL, pinned. Any drift here is a silent history rewrite.
    expect(sim.requestedUrls[0]).toBe(
      'https://dashboards.toastmasters.org/2024-2025/export.aspx' +
        '?type=CSV&report=districtsummary~6/30/2024~7/1/2024~2024-2025'
    )
  })

  it('never routes a historical year to the root path even when it is the live one that is asked for', async () => {
    const orchestrator = new BackfillOrchestrator(
      baseConfig({
        startYear: 2024,
        endYear: 2026,
        frequency: 'monthly',
        storage: createSpyStorage(),
      })
    )
    const sim = createSimulatedDownloader()
    orchestrator.downloader.downloadCsv = sim.downloadCsv

    await orchestrator.runPhase1Discovery()

    for (const url of sim.requestedUrls) {
      const isRoot = /toastmasters\.org\/export\.aspx/.test(url)
      const askedForLiveYear = url.endsWith(SIM_LIVE_PROGRAM_YEAR)
      // Root path ⇔ the live program year. Never one without the other.
      expect(isRoot).toBe(askedForLiveYear)
    }
  })

  it('skips empty (zero-data-row) responses instead of ingesting them', async () => {
    const storage = createSpyStorage()
    const orchestrator = new BackfillOrchestrator(baseConfig({ storage }))
    const sim = createSimulatedDownloader()
    orchestrator.downloader.downloadCsv = sim.downloadCsv

    await orchestrator.runPhase1Discovery()

    // 2026-07-01 … 07-25 is TI's dark window: HTTP 200, valid footer, no rows.
    // Writing those would publish a bogus snapshot under a real date.
    const darkWindowWrites = storage.writes.filter(w =>
      /raw-csv\/2026-07-(0[1-9]|1\d|2[0-5])\//.test(w.path)
    )
    expect(darkWindowWrites).toEqual([])

    // …while the dates that do have data are written.
    expect(
      storage.writes.some(w => w.path.includes('raw-csv/2026-07-29/'))
    ).toBe(true)
  })

  it('rejects a response whose footer as-of date is not the date requested', async () => {
    const storage = createSpyStorage()
    const orchestrator = new BackfillOrchestrator(baseConfig({ storage }))

    // Simulates the #1342 trap: the root path with an empty month-end slot
    // ignores the as-of date and returns *today*, with a valid DISTRICT header
    // and a plausible footer. Nothing in the CSV body flags it as wrong.
    orchestrator.downloader.downloadCsv = vi.fn().mockResolvedValue({
      url: 'https://dashboards.toastmasters.org/export.aspx',
      content:
        '"REGION","DISTRICT","Paid Clubs"\n"02","61","150"\n' +
        `Month of Aug, As of 08/02/2026`,
      statusCode: 200,
      byteSize: 80,
    })

    const result = await orchestrator.runPhase1Discovery()

    // Not one of the requested dates is 2026-08-02, so every response is a
    // mismatch — nothing may be written and nothing discovered.
    expect(storage.writes).toEqual([])
    expect(result.districtsPerYear[SIM_LIVE_PROGRAM_YEAR]).toEqual([])
  })
})
