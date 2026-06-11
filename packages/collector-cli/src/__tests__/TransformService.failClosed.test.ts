/**
 * TransformService — fail-closed closing remap via the closing-date registry (#1129)
 *
 * The 2026-04-17 rebuild published raw-csv/2026-02-13 under its raw date
 * because ClosingPeriodDetector.detect fails open when metadata.json is
 * absent. With a closing-date registry injected, the metadata chain becomes
 * metadata.json → CSV "As of" footer → registry, and a date the chain cannot
 * decide REFUSES to publish (fail closed) instead of defaulting to the raw
 * date.
 *
 * Acceptance criteria (#1129):
 * - AC1: metadata-less raw-csv dir within a registry closing window remaps
 *        (not raw-date publish)
 * - AC2: the 2026-02-13 stray is kept under its own date (Sprint 1 finding:
 *        it is a February daily scrape; Jan-2026 closed 2026-02-05)
 * - AC3: non-closing metadata-less dates still publish (don't over-block)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'
import { ClosingPeriodUndecidedError } from '../utils/closingWindowResolver.js'
import type { ClosingDateEntry } from '../utils/ClosingDateRegistry.js'
import {
  createRawCsvFixture,
  FOOTERLESS_ALL_DISTRICTS_CSV,
} from './fixtures/rawCsvFixture.js'

/** Registry slice mirroring docs/month-end-closing-dates.json (#1128) */
const REGISTRY: ClosingDateEntry[] = [
  { dataMonth: '2025-12', closingDate: '2026-01-08' },
  { dataMonth: '2026-01', closingDate: '2026-02-05' },
]

describe('TransformService — fail-closed closing remap (#1129)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transform-failclosed-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  function serviceWithRegistry(months: ClosingDateEntry[]): TransformService {
    return new TransformService({
      cacheDir: tempDir,
      closingDateRegistry: months,
    })
  }

  it('AC1: remaps a metadata-less, footer-less dir inside a registry closing window', async () => {
    await createRawCsvFixture(tempDir, '2026-02-03')
    const service = serviceWithRegistry(REGISTRY)

    const result = await service.transform({ date: '2026-02-03', force: true })

    expect(result.success).toBe(true)
    expect(result.date).toBe('2026-01-31')

    const remapped = await fs.stat(
      path.join(tempDir, 'snapshots', '2026-01-31')
    )
    expect(remapped.isDirectory()).toBe(true)
    await expect(
      fs.stat(path.join(tempDir, 'snapshots', '2026-02-03'))
    ).rejects.toThrow()
  })

  it('AC2: keeps the 2026-02-13 stray under its own date (after Jan window closed 02-05)', async () => {
    await createRawCsvFixture(tempDir, '2026-02-13')
    const service = serviceWithRegistry(REGISTRY)

    const result = await service.transform({ date: '2026-02-13', force: true })

    expect(result.success).toBe(true)
    expect(result.date).toBe('2026-02-13')

    const kept = await fs.stat(path.join(tempDir, 'snapshots', '2026-02-13'))
    expect(kept.isDirectory()).toBe(true)
    await expect(
      fs.stat(path.join(tempDir, 'snapshots', '2026-01-31'))
    ).rejects.toThrow()
  })

  it('AC3 / fail closed: refuses to publish a date the registry cannot decide', async () => {
    // 2026-06-08's previous month (2026-05) is not in the injected registry.
    await createRawCsvFixture(tempDir, '2026-06-08')
    const service = serviceWithRegistry(REGISTRY)

    const result = await service.transform({ date: '2026-06-08', force: true })

    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]?.error).toMatch(/registry|undecided/i)

    // Nothing published under any date
    await expect(fs.stat(path.join(tempDir, 'snapshots'))).rejects.toThrow()
  })

  it('readCacheMetadata rejects with ClosingPeriodUndecidedError when undecided', async () => {
    await createRawCsvFixture(tempDir, '2026-06-08', { csv: null })
    const service = serviceWithRegistry(REGISTRY)

    await expect(service.readCacheMetadata('2026-06-08')).rejects.toThrow(
      ClosingPeriodUndecidedError
    )
  })

  it('an empty configured registry fails closed (missing registry file shape)', async () => {
    await createRawCsvFixture(tempDir, '2026-02-13')
    const service = serviceWithRegistry([])

    const result = await service.transform({ date: '2026-02-13', force: true })

    expect(result.success).toBe(false)
  })

  it('the CSV footer outranks the registry when both could decide', async () => {
    // Footer says February data collected 02-03 (same month → non-closing),
    // even though the registry's Jan window runs through 02-05. The payload's
    // own As-of statement wins; the registry is only the fallback authority.
    await createRawCsvFixture(tempDir, '2026-02-03', {
      csv: `${FOOTERLESS_ALL_DISTRICTS_CSV}\nMonth of Feb, As of 02/03/2026`,
    })
    const service = serviceWithRegistry(REGISTRY)

    const result = await service.transform({ date: '2026-02-03', force: true })

    expect(result.success).toBe(true)
    expect(result.date).toBe('2026-02-03')
  })

  it('explicit metadata isClosingPeriod:false is trusted when no footer exists', async () => {
    const rawCsvDir = await createRawCsvFixture(tempDir, '2026-02-03')
    await fs.writeFile(
      path.join(rawCsvDir, 'metadata.json'),
      JSON.stringify({ date: '2026-02-03', isClosingPeriod: false })
    )
    const service = serviceWithRegistry(REGISTRY)

    const metadata = await service.readCacheMetadata('2026-02-03')
    expect(metadata?.isClosingPeriod).toBe(false)
  })

  it('writes registry-derived metadata back to the raw-csv dir with provenance', async () => {
    const rawCsvDir = await createRawCsvFixture(tempDir, '2026-02-03')
    const service = serviceWithRegistry(REGISTRY)

    await service.transform({ date: '2026-02-03', force: true })

    const written = JSON.parse(
      await fs.readFile(path.join(rawCsvDir, 'metadata.json'), 'utf-8')
    ) as Record<string, unknown>
    expect(written['isClosingPeriod']).toBe(true)
    expect(written['dataMonth']).toBe('2026-01')
    expect(written['closingPeriodSource']).toBe('closing-date-registry')
  })

  it('without a configured registry, legacy fail-open behavior is preserved', async () => {
    // Documented escape hatch: only production entry points (cli, rebuild)
    // are required to inject the registry. Constructing without it keeps the
    // pre-#1129 behavior so unrelated fixtures don't over-block.
    await createRawCsvFixture(tempDir, '2026-02-03')
    const service = new TransformService({ cacheDir: tempDir })

    const result = await service.transform({ date: '2026-02-03', force: true })

    expect(result.success).toBe(true)
    expect(result.date).toBe('2026-02-03')
  })
})
