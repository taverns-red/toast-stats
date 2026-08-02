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
  buildExportUrl,
  type BackfillDateSpec,
} from '../services/HttpCsvDownloader.js'
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
    async existsFresh() {
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

/**
 * Drop the run's live-year resolution probes, keeping only the requests made
 * for the dates being backfilled.
 *
 * The probes are as-of *today* and are the one place that deliberately asks
 * for `/{live PY}/export.aspx` — that 500 is how the orchestrator learns the
 * year has no archive path. No collection date in these tests is today, so the
 * as-of is an unambiguous discriminator.
 */
function collectionUrls(urls: string[]): string[] {
  const [y, m, d] = SIM_TODAY.split('-')
  const todayAsOf = `~${parseInt(m!, 10)}/${parseInt(d!, 10)}/${y}~`
  return urls.filter(u => !u.includes(todayAsOf))
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
    const archivePrefixed = collectionUrls(sim.requestedUrls).filter(u =>
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
      collectionUrls(sim.requestedUrls).filter(u =>
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

    for (const url of collectionUrls(sim.requestedUrls)) {
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

  it('backfills an explicit list of dates — the #1384 recovery set', async () => {
    const storage = createSpyStorage()
    const orchestrator = new BackfillOrchestrator(
      baseConfig({
        storage,
        liveProgramYear: SIM_LIVE_PROGRAM_YEAR,
        dates: ['2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29'].map(
          d => new Date(`${d}T00:00:00`)
        ),
      })
    )
    const sim = createSimulatedDownloader()
    orchestrator.downloader.downloadCsv = sim.downloadCsv

    const result = await orchestrator.runPhase1Discovery()

    // Exactly the four dates, each on the root path, each with the month-end
    // slot populated — the empty slot is what makes the endpoint serve today.
    expect(sim.requestedUrls).toEqual([
      'https://dashboards.toastmasters.org/export.aspx?type=CSV&report=districtsummary~6/30/2026~7/26/2026~2026-2027',
      'https://dashboards.toastmasters.org/export.aspx?type=CSV&report=districtsummary~6/30/2026~7/27/2026~2026-2027',
      'https://dashboards.toastmasters.org/export.aspx?type=CSV&report=districtsummary~6/30/2026~7/28/2026~2026-2027',
      'https://dashboards.toastmasters.org/export.aspx?type=CSV&report=districtsummary~6/30/2026~7/29/2026~2026-2027',
    ])
    expect(storage.writes.map(w => w.path)).toEqual([
      '/data/cache/raw-csv/2026-07-26/all-districts.csv',
      '/data/cache/raw-csv/2026-07-27/all-districts.csv',
      '/data/cache/raw-csv/2026-07-28/all-districts.csv',
      '/data/cache/raw-csv/2026-07-29/all-districts.csv',
    ])
    expect(result.emptySkipped).toBe(0)
    expect(result.mismatches).toBe(0)
  })

  it('collects per-district reports for an explicit date list', async () => {
    const storage = createSpyStorage()
    const orchestrator = new BackfillOrchestrator(
      baseConfig({
        storage,
        liveProgramYear: SIM_LIVE_PROGRAM_YEAR,
        dates: [new Date('2026-07-26T00:00:00')],
      })
    )
    const sim = createSimulatedDownloader()
    orchestrator.downloader.downloadCsv = sim.downloadCsv

    const result = await orchestrator.runPhase2Collection({
      [SIM_LIVE_PROGRAM_YEAR]: ['61'],
    })

    expect(result.errors).toBe(0)
    expect(sim.requestedUrls).toEqual([
      'https://dashboards.toastmasters.org/export.aspx?type=CSV&report=districtperformance~61~6/30/2026~7/26/2026~2026-2027',
      'https://dashboards.toastmasters.org/export.aspx?type=CSV&report=divisionperformance~61~6/30/2026~7/26/2026~2026-2027',
      'https://dashboards.toastmasters.org/export.aspx?type=CSV&report=clubperformance~61~6/30/2026~7/26/2026~2026-2027',
    ])
    expect(storage.writes.map(w => w.path)).toEqual([
      '/data/cache/raw-csv/2026-07-26/district-61/district-performance.csv',
      '/data/cache/raw-csv/2026-07-26/district-61/division-performance.csv',
      '/data/cache/raw-csv/2026-07-26/district-61/club-performance.csv',
      '/data/cache/raw-csv/2026-07-26/metadata.json',
    ])
  })

  it('keeps a year that still HAS an archive path on /{PY}/, even when the root path is serving it', async () => {
    // The July rollover window: the root path serves the PRIOR program year
    // because the new one has not published yet, so resolveActiveProgramYear
    // reports pathStyle:'live' for 2025-2026. That does NOT mean 2025-2026
    // lost its archive path — and the root path cannot serve historical as-of
    // dates (it returns zero rows). Routing the whole year there would skip
    // every date and exit 0, which is the silent-failure direction.
    const storage = createSpyStorage()
    const orchestrator = new BackfillOrchestrator(
      baseConfig({
        storage,
        startYear: 2025,
        endYear: 2025,
        frequency: 'monthly',
      })
    )

    const seen: Array<{ url: string }> = []
    orchestrator.downloader.downloadCsv = vi
      .fn()
      .mockImplementation(async (spec: BackfillDateSpec) => {
        const url = buildExportUrl(spec)
        seen.push({ url })
        const asOf = `${spec.date.getMonth() + 1}/${spec.date.getDate()}/${spec.date.getFullYear()}`
        // Root serves the prior year's June close (the rollover window).
        const content =
          spec.pathStyle === 'live'
            ? `"REGION","DISTRICT"\n"02","61"\nMonth of Jun, As of ${asOf}`
            : `"REGION","DISTRICT"\n"02","61"\nMonth of Jun, As of ${asOf}`
        return { url, content, statusCode: 200, byteSize: content.length }
      })

    await orchestrator.runPhase1Discovery()

    // /2025-2026/ answers, so the year is NOT root-only and every collection
    // request must use it.
    const collectionUrls = seen
      .map(s => s.url)
      .filter(u => !u.includes('~8/2/2026~')) // drop the resolution probes
    expect(collectionUrls.length).toBeGreaterThan(0)
    for (const url of collectionUrls) {
      expect(url).toContain('/2025-2026/export.aspx')
    }
  })

  it('reports mismatches so the caller can fail the run', async () => {
    const orchestrator = new BackfillOrchestrator(
      baseConfig({
        storage: createSpyStorage(),
        liveProgramYear: SIM_LIVE_PROGRAM_YEAR,
        dates: [new Date('2026-07-26T00:00:00')],
      })
    )
    orchestrator.downloader.downloadCsv = vi.fn().mockResolvedValue({
      url: 'https://dashboards.toastmasters.org/export.aspx',
      content: '"REGION","DISTRICT"\n"02","61"\nMonth of Aug, As of 08/02/2026',
      statusCode: 200,
      byteSize: 80,
    })

    const result = await orchestrator.runPhase1Discovery()

    expect(result.mismatches).toBe(1)
    // A run that ingested nothing because everything was wrong must not be
    // indistinguishable from a clean run.
    const summary = await orchestrator.run()
    expect(summary.mismatches).toBeGreaterThan(0)
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
