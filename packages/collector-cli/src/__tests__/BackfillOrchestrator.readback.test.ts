/**
 * Post-run read-back verification (#1388).
 *
 * The 2026-07-26 → 07-29 ingest wrote every object to
 * `gs://toast-stats-data-staging//raw-csv/…` and reported
 * `requests=1132 emptySkipped=0 mismatches=0 errors=0`, exit 0. Every gate
 * passed because every gate inspected the *response*. Nothing ever asked the
 * bucket whether the object it had just written was there.
 *
 * These tests pin the missing question: after the run, read back at least one
 * object per date, from storage, and make its absence a failure rather than a
 * warning.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BackfillOrchestrator,
  GcsBackfillStorage,
  verifyBackfillWrites,
  type BackfillConfig,
  type BackfillStorage,
} from '../services/BackfillOrchestrator.js'
import { logger } from '../utils/logger.js'
import {
  createSimulatedDownloader,
  SIM_LIVE_PROGRAM_YEAR,
  SIM_TODAY,
} from './fakes/dashboardExportSimulator.js'

/** Storage that keeps what it is given — the honest case. */
function createMemoryStorage(): BackfillStorage & { keys: string[] } {
  const store = new Map<string, string>()
  return {
    get keys() {
      return [...store.keys()]
    },
    async exists(path: string) {
      return store.has(path)
    },
    async existsFresh(path: string) {
      return store.has(path)
    },
    async read(path: string) {
      return store.get(path) ?? ''
    },
    async write(path: string, content: string) {
      store.set(path, content)
    },
  }
}

/**
 * Storage that accepts every write and keeps nothing — a stand-in for writing
 * to a key space no one reads. Every write "succeeds"; nothing is there after.
 */
function createBlackHoleStorage(): BackfillStorage & { written: string[] } {
  const written: string[] = []
  return {
    written,
    async exists() {
      return false
    },
    async existsFresh() {
      return false
    },
    async read() {
      return ''
    },
    async write(path: string) {
      written.push(path)
    },
  }
}

function baseConfig(overrides: Partial<BackfillConfig> = {}): BackfillConfig {
  return {
    startYear: 2026,
    endYear: 2026,
    frequency: 'weekly',
    ratePerSecond: 1000,
    outputDir: 'backfill',
    phase: 'discover',
    liveProgramYear: SIM_LIVE_PROGRAM_YEAR,
    dates: ['2026-07-26', '2026-07-27'].map(d => new Date(`${d}T00:00:00`)),
    ...overrides,
  }
}

describe('verifyBackfillWrites (#1388)', () => {
  it('reports every date whose sample object is not in storage', async () => {
    const storage = createMemoryStorage()
    await storage.write('raw-csv/2026-07-26/all-districts.csv', 'x')

    const missing = await verifyBackfillWrites(
      storage,
      new Map([
        ['2026-07-26', 'raw-csv/2026-07-26/all-districts.csv'],
        ['2026-07-27', 'raw-csv/2026-07-27/all-districts.csv'],
      ])
    )

    expect(missing).toEqual(['2026-07-27'])
  })

  it('reports nothing when every sample is present', async () => {
    const storage = createMemoryStorage()
    await storage.write('raw-csv/2026-07-26/all-districts.csv', 'x')

    const missing = await verifyBackfillWrites(
      storage,
      new Map([['2026-07-26', 'raw-csv/2026-07-26/all-districts.csv']])
    )

    expect(missing).toEqual([])
  })

  it('asks storage fresh, never the write-through cache', async () => {
    // GcsBackfillStorage.exists() answers from the warmed key set, which
    // write() adds to. Verifying through it would only re-read the run's own
    // optimism — the object would "exist" whether or not GCS ever saw it.
    const storage: BackfillStorage = {
      async exists() {
        return true
      },
      async existsFresh() {
        return false
      },
      async read() {
        return ''
      },
      async write() {},
    }

    const missing = await verifyBackfillWrites(
      storage,
      new Map([['2026-07-26', 'raw-csv/2026-07-26/all-districts.csv']])
    )

    expect(missing).toEqual(['2026-07-26'])
  })
})

describe('GcsBackfillStorage.existsFresh (#1388)', () => {
  it('bypasses the warmed key cache and asks the bucket', async () => {
    const fileExists = vi.fn().mockResolvedValue([false])
    const bucket = {
      getFiles: vi
        .fn()
        .mockResolvedValue([[{ name: 'backfill/raw-csv/2026-07-26/x.csv' }]]),
      file: vi.fn().mockReturnValue({
        exists: fileExists,
        save: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as import('@google-cloud/storage').Bucket
    const storage = new GcsBackfillStorage(bucket)

    await storage.warmCache('backfill')
    // The write-through cache would answer "yes" here.
    await storage.write('backfill/raw-csv/2026-07-26/x.csv', 'data')
    expect(await storage.exists('backfill/raw-csv/2026-07-26/x.csv')).toBe(true)

    expect(await storage.existsFresh('backfill/raw-csv/2026-07-26/x.csv')).toBe(
      false
    )
    expect(fileExists).toHaveBeenCalled()
  })
})

describe('BackfillOrchestrator read-back (#1388)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${SIM_TODAY}T12:00:00Z`))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports no read-back failures when the objects are really there', async () => {
    const storage = createMemoryStorage()
    const orchestrator = new BackfillOrchestrator(baseConfig({ storage }))
    orchestrator.downloader.downloadCsv =
      createSimulatedDownloader().downloadCsv

    const summary = await orchestrator.run()

    expect(storage.keys).toContain(
      'backfill/raw-csv/2026-07-26/all-districts.csv'
    )
    expect(summary.readbackFailures).toEqual([])
  })

  it('fails the run when what it wrote is not at the composed prefix', async () => {
    const storage = createBlackHoleStorage()
    const orchestrator = new BackfillOrchestrator(baseConfig({ storage }))
    orchestrator.downloader.downloadCsv =
      createSimulatedDownloader().downloadCsv

    const summary = await orchestrator.run()

    // The failure shape of the incident: fetches all fine, nothing to show.
    expect(summary.mismatches).toBe(0)
    expect(summary.errors).toBe(0)
    expect(storage.written.length).toBeGreaterThan(0)
    expect(summary.readbackFailures).toEqual(['2026-07-26', '2026-07-27'])
  })
})

describe('BackfillOrchestrator destination log (#1388)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${SIM_TODAY}T12:00:00Z`))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('names the fully-qualified destination once, before writing anything', async () => {
    const storage = createMemoryStorage()
    const infos: Array<{ message: string; data?: unknown }> = []
    vi.spyOn(logger, 'info').mockImplementation((message, data) => {
      infos.push({ message, data })
    })

    const orchestrator = new BackfillOrchestrator(
      baseConfig({ storage, bucketName: 'toast-stats-data-staging' })
    )
    orchestrator.downloader.downloadCsv =
      createSimulatedDownloader().downloadCsv

    await orchestrator.run()

    const banners = infos.filter(l => l.message === 'Backfill destination')
    expect(banners).toHaveLength(1)
    expect(banners[0]!.data).toEqual({
      destination: 'gs://toast-stats-data-staging/backfill/raw-csv/',
    })
    // Before the first write, not after it.
    expect(infos.indexOf(banners[0]!)).toBeLessThan(
      infos.findIndex(l => l.message === 'Phase 1: Discovery starting')
    )
  })

  it('reports a failed read-back against the qualified destination', async () => {
    const storage = createBlackHoleStorage()
    const errors: Array<{ message: string; data?: unknown }> = []
    vi.spyOn(logger, 'error').mockImplementation((message, data) => {
      errors.push({ message, data })
    })

    const orchestrator = new BackfillOrchestrator(
      baseConfig({ storage, bucketName: 'toast-stats-data-staging' })
    )
    orchestrator.downloader.downloadCsv =
      createSimulatedDownloader().downloadCsv

    await orchestrator.run()

    const failure = errors.find(e => e.message.startsWith('Read-back FAILED'))
    expect(failure?.data).toMatchObject({
      destination: 'gs://toast-stats-data-staging/backfill/raw-csv/',
      missingDates: ['2026-07-26', '2026-07-27'],
    })
  })
})

describe('BackfillOrchestrator read-back under --resume (#1388)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${SIM_TODAY}T12:00:00Z`))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('verifies dates it skipped as already-present, not just dates it wrote', async () => {
    // A fully-resumed run writes nothing. If only writes are sampled, the
    // read-back is vacuous and `readbackFailures=0` overstates what was
    // checked — precisely the reassurance the incident ran on.
    const storage: BackfillStorage & { freshChecks: string[] } = {
      freshChecks: [],
      async exists() {
        return true
      },
      async existsFresh(path: string) {
        storage.freshChecks.push(path)
        return false
      },
      async read() {
        return '"REGION","DISTRICT"\n"02","61"\nMonth of Jul, As of 07/26/2026'
      },
      async write() {},
    }

    const orchestrator = new BackfillOrchestrator(
      baseConfig({ storage, resume: true })
    )
    orchestrator.downloader.downloadCsv =
      createSimulatedDownloader().downloadCsv

    const summary = await orchestrator.run()

    expect(storage.freshChecks).toEqual([
      'backfill/raw-csv/2026-07-26/all-districts.csv',
      'backfill/raw-csv/2026-07-27/all-districts.csv',
    ])
    expect(summary.readbackFailures).toEqual(['2026-07-26', '2026-07-27'])
  })
})
