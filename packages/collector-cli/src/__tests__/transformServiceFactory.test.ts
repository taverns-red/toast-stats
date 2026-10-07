/**
 * transformServiceFactory — the production TransformService constructor
 * (#1160, #1129; behavioural tests #1687).
 *
 * The factory's whole job is to load docs/month-end-closing-dates.json from
 * the project root (cwd) and inject it, so production can never silently fall
 * back to the fail-open legacy mode. These tests prove that through behaviour:
 * a factory-built service remaps a registry closing window and FAILS CLOSED
 * when the registry is missing, where a bare `new TransformService(...)`
 * would publish the raw date.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  createProductionTransformService,
  loadClosingDateRegistryMonths,
} from '../services/transformServiceFactory.js'
import { TransformService } from '../services/TransformService.js'
import type { ClosingDateEntry } from '../utils/ClosingDateRegistry.js'
import { createRawCsvFixture } from './fixtures/rawCsvFixture.js'

const MONTHS: ClosingDateEntry[] = [
  { dataMonth: '2025-12', closingDate: '2026-01-08' },
  { dataMonth: '2026-01', closingDate: '2026-02-05' },
]

describe('transformServiceFactory', () => {
  let projectRoot: string
  let cacheDir: string
  let stderr: ReturnType<typeof vi.spyOn>
  let stdout: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tsf-root-'))
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsf-cache-'))
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot)
    stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(projectRoot, { recursive: true, force: true })
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  async function writeRegistry(content: string): Promise<void> {
    await fs.mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    await fs.writeFile(
      path.join(projectRoot, 'docs', 'month-end-closing-dates.json'),
      content
    )
  }

  function registryJson(months: ClosingDateEntry[]): string {
    return JSON.stringify({
      generatedAt: '2026-02-06T00:00:00.000Z',
      description: 'test registry',
      months,
    })
  }

  describe('loadClosingDateRegistryMonths', () => {
    it('reads the months from docs/month-end-closing-dates.json under cwd', async () => {
      await writeRegistry(registryJson(MONTHS))

      await expect(loadClosingDateRegistryMonths()).resolves.toEqual(MONTHS)
      expect(stderr).not.toHaveBeenCalled()
    })

    it('returns [] (not undefined) and warns on stderr when the file is missing', async () => {
      const months = await loadClosingDateRegistryMonths()

      expect(months).toEqual([])
      expect(stderr).toHaveBeenCalledTimes(1)
      expect(String(stderr.mock.calls[0]?.[0])).toMatch(/FAIL CLOSED/)
      expect(stdout).not.toHaveBeenCalled()
    })

    it('returns [] and warns when the registry is corrupt JSON', async () => {
      await writeRegistry('{ not json')

      await expect(loadClosingDateRegistryMonths()).resolves.toEqual([])
      expect(stderr).toHaveBeenCalledWith(
        expect.stringMatching(/registry is empty or missing/)
      )
    })

    it('returns [] and warns when the registry has no months', async () => {
      await writeRegistry(registryJson([]))

      await expect(loadClosingDateRegistryMonths()).resolves.toEqual([])
      expect(stderr).toHaveBeenCalledTimes(1)
    })
  })

  describe('createProductionTransformService', () => {
    it('returns a TransformService', async () => {
      await writeRegistry(registryJson(MONTHS))
      const service = await createProductionTransformService({ cacheDir })
      expect(service).toBeInstanceOf(TransformService)
    })

    it('injects the loaded registry: a footer-less date in a closing window remaps into cacheDir', async () => {
      await writeRegistry(registryJson(MONTHS))
      await createRawCsvFixture(cacheDir, '2026-02-03')

      const service = await createProductionTransformService({ cacheDir })
      const result = await service.transform({
        date: '2026-02-03',
        force: true,
      })

      expect(result.success).toBe(true)
      expect(result.date).toBe('2026-01-31')
      const remapped = await fs.stat(
        path.join(cacheDir, 'snapshots', '2026-01-31')
      )
      expect(remapped.isDirectory()).toBe(true)
    })

    it('fails CLOSED when the registry file is missing (where a bare service fails open)', async () => {
      await createRawCsvFixture(cacheDir, '2026-02-13')

      // Control: the legacy no-registry constructor publishes the raw date.
      const bare = new TransformService({ cacheDir })
      const open = await bare.transform({ date: '2026-02-13', force: true })
      expect(open.success).toBe(true)
      await fs.rm(path.join(cacheDir, 'snapshots'), {
        recursive: true,
        force: true,
      })

      const service = await createProductionTransformService({ cacheDir })
      const result = await service.transform({
        date: '2026-02-13',
        force: true,
      })

      expect(result.success).toBe(false)
      await expect(fs.stat(path.join(cacheDir, 'snapshots'))).rejects.toThrow()
    })

    it('forwards the caller-supplied logger to the service', async () => {
      await writeRegistry(registryJson(MONTHS))
      await createRawCsvFixture(cacheDir, '2026-02-03')
      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }

      const service = await createProductionTransformService({
        cacheDir,
        logger,
      })
      await service.transform({ date: '2026-02-03', force: true })

      const calls =
        logger.info.mock.calls.length +
        logger.warn.mock.calls.length +
        logger.debug.mock.calls.length
      expect(calls).toBeGreaterThan(0)
    })
  })
})
