/**
 * `collector-cli upload` destination bucket (#2288).
 *
 * The command used to default GCS_BUCKET to prod (toast-stats-data-ca), so a
 * hand run with no bucket wrote to production outside the gated promoter
 * (ADR-015 step 9). Now it matches scripts/lib/operatorBucket.ts for a script
 * that writes: no bucket means refuse, and naming prod needs --allow-prod.
 *
 * UploadService is mocked: the constructor records the bucket it was handed
 * and `upload()` rejects, so no test can reach GCS whatever the CLI decides.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const constructed = vi.hoisted(() => ({ buckets: [] as string[] }))

vi.mock('../services/UploadService.js', () => ({
  UploadService: class {
    constructor(config: { bucket: string }) {
      constructed.buckets.push(config.bucket)
    }
    upload(): Promise<never> {
      return Promise.reject(new Error('mock upload: not reaching GCS'))
    }
  },
}))

import { createCLI } from '../cli.js'

async function parseCLI(
  args: string[]
): Promise<{ exitCode: number | undefined; stderr: string }> {
  const stderr: string[] = []
  let exitCode: number | undefined

  const exitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation((code?: string | number | null | undefined) => {
      exitCode = typeof code === 'number' ? code : 0
      throw new Error(`process.exit(${code})`)
    })
  const errorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((...a: unknown[]) => {
      stderr.push(a.map(String).join(' '))
    })

  try {
    const program = createCLI()
    program.exitOverride()
    await program.parseAsync(['node', 'test', ...args])
  } catch {
    // process.exit mock or the mocked upload rejection
  } finally {
    exitSpy.mockRestore()
    errorSpy.mockRestore()
  }
  return { exitCode, stderr: stderr.join('\n') }
}

describe('collector-cli upload bucket (#2288)', () => {
  const saved = {
    bucket: process.env['GCS_BUCKET'],
    prod: process.env['GCS_BUCKET_PRODUCTION'],
  }

  beforeEach(() => {
    constructed.buckets = []
    delete process.env['GCS_BUCKET']
    delete process.env['GCS_BUCKET_PRODUCTION']
  })

  afterEach(() => {
    for (const [key, value] of [
      ['GCS_BUCKET', saved.bucket],
      ['GCS_BUCKET_PRODUCTION', saved.prod],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('refuses to run with no bucket instead of defaulting to prod', async () => {
    const { exitCode, stderr } = await parseCLI(['upload', '--dry-run'])

    expect(constructed.buckets).toEqual([])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('No bucket given')
  })

  it('uploads to the bucket GCS_BUCKET names', async () => {
    process.env['GCS_BUCKET'] = 'toast-stats-data-staging'

    await parseCLI(['upload', '--dry-run'])

    expect(constructed.buckets).toEqual(['toast-stats-data-staging'])
  })

  it('--bucket wins over GCS_BUCKET and accepts a gs:// URL', async () => {
    process.env['GCS_BUCKET'] = 'some-other-bucket'

    await parseCLI([
      'upload',
      '--dry-run',
      '--bucket',
      'gs://toast-stats-data-staging/',
    ])

    expect(constructed.buckets).toEqual(['toast-stats-data-staging'])
  })

  it('refuses the prod bucket without --allow-prod', async () => {
    process.env['GCS_BUCKET'] = 'toast-stats-data-ca'

    const { exitCode, stderr } = await parseCLI(['upload', '--dry-run'])

    expect(constructed.buckets).toEqual([])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('--allow-prod')
  })

  it('refuses the bucket GCS_BUCKET_PRODUCTION names without --allow-prod', async () => {
    process.env['GCS_BUCKET_PRODUCTION'] = 'gs://prod-elsewhere'

    const { exitCode } = await parseCLI([
      'upload',
      '--dry-run',
      '--bucket',
      'prod-elsewhere',
    ])

    expect(constructed.buckets).toEqual([])
    expect(exitCode).toBe(2)
  })

  it('uploads to prod when --allow-prod is passed', async () => {
    process.env['GCS_BUCKET'] = 'toast-stats-data-ca'

    await parseCLI(['upload', '--dry-run', '--allow-prod'])

    expect(constructed.buckets).toEqual(['toast-stats-data-ca'])
  })
})
