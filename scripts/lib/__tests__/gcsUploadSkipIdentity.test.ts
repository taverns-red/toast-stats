/**
 * #2972 (COO condition): --on-exists skip must not hide a different object.
 * When the destination already exists, its md5Hash is compared with the
 * source's (the source object's for `copy`, the local file's for `put`).
 * Match: skip. Mismatch, a missing md5 on either side, or a failed metadata
 * read: an error, never a skip.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uploadObject, type UploadOptions } from '../gcsUpload'
import { runUploadCli } from '../gcsUploadCli'

// base64 md5 of 'abc'
const ABC = 'kAFQmDzST7DWlj99KOF/cg=='
const OTHER = '6AtQFwmJUPxYqtg8jBSXjg=='

let dir: string
let file: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gcs-skip-'))
  file = join(dir, 'a.bin')
  writeFileSync(file, 'abc')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

interface Dest {
  status?: number
  body?: string
}

/** Initiation answers 412; the metadata GETs answer per bucket. */
const world = (
  dest: Dest,
  srcMeta = `{"size":"3","md5Hash":"${ABC}"}`
): { fetchFn: typeof fetch; urls: string[] } => {
  const urls: string[] = []
  const fetchFn = vi.fn(async (url: string, i: RequestInit) => {
    urls.push(`${i.method} ${url}`)
    if (i.method === 'POST') return new Response('{}', { status: 412 })
    if (url.includes('/b/dst/o/'))
      return new Response(dest.body ?? '{}', { status: dest.status ?? 200 })
    return new Response(srcMeta, { status: 200 })
  }) as unknown as typeof fetch
  return { fetchFn, urls }
}

const copyOpts = (fetchFn: typeof fetch): UploadOptions => ({
  bucket: 'dst',
  object: 'o.bin',
  source: { kind: 'gcs', bucket: 'src', object: 'o.bin' },
  contentType: 'application/octet-stream',
  cacheControl: 'no-transform',
  onExists: 'skip',
  token: 't',
  fetch: fetchFn,
})
const putOpts = (fetchFn: typeof fetch): UploadOptions => ({
  ...copyOpts(fetchFn),
  source: { kind: 'file', path: file },
})

describe('skip compares the existing object (#2972)', () => {
  it.each([
    ['copy', copyOpts],
    ['put', putOpts],
  ] as const)('%s: identical md5 skips', async (_n, mk) => {
    const { fetchFn, urls } = world({ body: `{"md5Hash":"${ABC}"}` })
    expect(await uploadObject(mk(fetchFn))).toBe('skipped')
    expect(urls.some(u => u.includes('/b/dst/o/o.bin?fields=md5Hash'))).toBe(
      true
    )
  })

  it.each([
    ['copy', copyOpts],
    ['put', putOpts],
  ] as const)('%s: a different md5 throws', async (_n, mk) => {
    const { fetchFn } = world({ body: `{"md5Hash":"${OTHER}"}` })
    await expect(uploadObject(mk(fetchFn))).rejects.toThrow(/differs|mismatch/i)
  })

  it('a destination without md5Hash throws', async () => {
    const { fetchFn } = world({ body: '{}' })
    await expect(uploadObject(copyOpts(fetchFn))).rejects.toThrow(/md5/i)
  })

  it.each([401, 403, 404, 500])(
    'a destination metadata read that fails (%i) throws, never skips',
    async status => {
      const { fetchFn } = world({ status })
      await expect(uploadObject(copyOpts(fetchFn))).rejects.toThrow(
        String(status)
      )
    }
  )
})

describe('skip exit codes (#2972)', () => {
  const argv = (cmd: 'copy' | 'put'): string[] => [
    cmd,
    '--bucket',
    'dst',
    '--object',
    'o.bin',
    ...(cmd === 'copy' ? ['--from-bucket', 'src'] : ['--file', file]),
    '--content-type',
    'application/octet-stream',
    '--cache-control',
    'no-transform',
    '--on-exists',
    'skip',
  ]
  const run = async (a: string[], fetchFn: typeof fetch) => {
    const logs: string[] = []
    const code = await runUploadCli(a, {
      token: 'tok',
      fetch: fetchFn,
      log: l => logs.push(l),
    })
    return { code, logs: logs.join('\n') }
  }

  it('match exits 0 and logs "already present, identical"', async () => {
    const { fetchFn } = world({ body: `{"md5Hash":"${ABC}"}` })
    const r = await run(argv('copy'), fetchFn)
    expect(r.code).toBe(0)
    expect(r.logs).toContain('already present, identical')
  })

  it('mismatch exits 1', async () => {
    const { fetchFn } = world({ body: `{"md5Hash":"${OTHER}"}` })
    expect((await run(argv('copy'), fetchFn)).code).toBe(1)
    expect((await run(argv('put'), fetchFn)).code).toBe(1)
  })

  it('a missing md5 exits 1', async () => {
    const { fetchFn } = world({ body: '{}' })
    expect((await run(argv('copy'), fetchFn)).code).toBe(1)
  })

  it('a 403 on the destination read exits 1', async () => {
    const { fetchFn } = world({ status: 403 })
    expect((await run(argv('copy'), fetchFn)).code).toBe(1)
  })
})
