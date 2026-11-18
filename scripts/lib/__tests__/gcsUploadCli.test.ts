/**
 * #2972: the upload CLI's argument contract. onExists is required (no
 * default), every failure exits non-zero, and the token is never logged.
 */
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runUploadCli } from '../gcsUploadCli'

// base64 md5 of 'abc', the bytes of the test file and of the fake source
const ABC_MD5 = 'kAFQmDzST7DWlj99KOF/cg=='
const dir = mkdtempSync(join(tmpdir(), 'gcs-cli-'))
const file = join(dir, 'a.bin')
writeFileSync(file, 'abc')

const ok = (): typeof fetch =>
  vi.fn(async (_u: string, i: RequestInit) =>
    i.method === 'POST'
      ? new Response('{}', {
          status: 200,
          headers: { Location: 'https://s/x' },
        })
      : new Response(`{"md5Hash":"${ABC_MD5}"}`, { status: 200 })
  ) as unknown as typeof fetch

const run = (argv: string[], fetchFn: typeof fetch, token = 'tok') => {
  const logs: string[] = []
  return runUploadCli(argv, {
    token,
    fetch: fetchFn,
    log: l => logs.push(l),
  }).then(code => ({ code, logs }))
}

const base = [
  'put',
  '--bucket',
  'b',
  '--object',
  'videos/x.mp4',
  '--file',
  file,
  '--content-type',
  'video/mp4',
  '--cache-control',
  'no-transform',
]

describe('gcs-upload CLI (#2972)', () => {
  it('uploads and exits 0', async () => {
    expect((await run([...base, '--on-exists', 'fail'], ok())).code).toBe(0)
  })

  it('exits 2 without --on-exists: there is no default', async () => {
    const f = ok()
    expect((await run(base, f)).code).toBe(2)
    expect(f).not.toHaveBeenCalled()
  })

  it('exits 2 for a bad --on-exists value, a missing option or a missing token', async () => {
    expect((await run([...base, '--on-exists', 'overwrite'], ok())).code).toBe(
      2
    )
    expect(
      (await run(['put', '--on-exists', 'fail', '--bucket', 'b'], ok())).code
    ).toBe(2)
    expect((await run([...base, '--on-exists', 'fail'], ok(), '')).code).toBe(2)
  })

  // Initiation answers 412; the destination read a skip makes holds the same bytes.
  const exists = (): typeof fetch =>
    vi.fn(async (_u: string, i: RequestInit) =>
      i.method === 'POST'
        ? new Response('{}', { status: 412 })
        : new Response(`{"md5Hash":"${ABC_MD5}"}`, { status: 200 })
    ) as unknown as typeof fetch

  it('412 exits 0 with skip and 1 with fail', async () => {
    expect((await run([...base, '--on-exists', 'skip'], exists())).code).toBe(0)
    expect((await run([...base, '--on-exists', 'fail'], exists())).code).toBe(1)
  })

  it('403 exits 1 even with skip, and the log omits the token', async () => {
    const f = vi.fn(
      async () => new Response('{}', { status: 403 })
    ) as unknown as typeof fetch
    const r = await run([...base, '--on-exists', 'skip'], f, 'sekrit-token')
    expect(r.code).toBe(1)
    expect(r.logs.join('\n')).not.toContain('sekrit-token')
  })

  it('copy reads the staging object and writes the destination', async () => {
    const f = vi.fn(async (u: string, i: RequestInit) =>
      i.method === 'POST'
        ? new Response('{}', {
            status: 200,
            headers: { Location: 'https://s/x' },
          })
        : i.method === 'PUT'
          ? new Response(`{"md5Hash":"${ABC_MD5}"}`, { status: 200 })
          : u.includes('alt=media')
            ? new Response('abc', {
                status: 206,
                headers: { 'Content-Range': 'bytes 0-2/3' },
              })
            : new Response(`{"size":"3","md5Hash":"${ABC_MD5}"}`, {
                status: 200,
              })
    ) as unknown as typeof fetch
    const r = await run(
      [
        'copy',
        '--from-bucket',
        'stg',
        '--bucket',
        'prod',
        '--object',
        'basemap/x.pmtiles',
        '--content-type',
        'application/octet-stream',
        '--cache-control',
        'c',
        '--on-exists',
        'skip',
      ],
      f
    )
    expect(r.code).toBe(0)
  })

  it('exists: 0 when absent, 10 when present, 1 on an error', async () => {
    const a = ['exists', '--bucket', 'b', '--object', 'o']
    const st = (s: number) =>
      vi.fn(
        async () => new Response('{}', { status: s })
      ) as unknown as typeof fetch
    expect((await run(a, st(404))).code).toBe(0)
    expect((await run(a, st(200))).code).toBe(10)
    expect((await run(a, st(403))).code).toBe(1)
  })

  it('exits 2 for an unknown subcommand', async () => {
    expect((await run(['rm'], ok())).code).toBe(2)
  })
})
