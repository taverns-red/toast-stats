/**
 * #2972: the create-only upload helper that replaces `gcloud storage cp`.
 * `cp` to a new object reads the destination and lists a prefix, neither of
 * which the media identity holds. A direct objects.insert needs only
 * storage.objects.create.
 *
 * API: https://docs.cloud.google.com/storage/docs/json_api/v1/objects/insert
 * (query ifGenerationMatch; 0 means "only if the object does not exist") and
 * https://docs.cloud.google.com/storage/docs/resumable-uploads
 * (POST uploadType=resumable, then PUT the bytes to the returned Location).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  uploadObject,
  objectExists,
  ObjectExistsError,
  type UploadOptions,
} from '../gcsUpload'

const SECRET = 'ya29.super-secret-token'
let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gcs-upload-'))
  file = join(dir, 'a.mp4')
  writeFileSync(file, 'hello-bytes')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const session =
  'https://storage.googleapis.com/upload/storage/v1/b/b/o?upload_id=U1'

interface Call {
  url: string
  init: RequestInit
}

/** A fake of the two-request resumable protocol. */
const fakeGcs = (
  init: { initiate?: number; put?: number } = {}
): { fetchFn: typeof fetch; calls: Call[] } => {
  const calls: Call[] = []
  const fetchFn = vi.fn(async (url: string, i: RequestInit) => {
    calls.push({ url, init: i })
    if (i.method === 'POST')
      return init.initiate && init.initiate !== 200
        ? new Response('{"error":"x"}', { status: init.initiate })
        : new Response('{}', { status: 200, headers: { Location: session } })
    if (i.method === 'PUT')
      return new Response('{"name":"o","size":"11"}', {
        status: init.put ?? 200,
      })
    return new Response('x', { status: 200 })
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

const opts = (over: Partial<UploadOptions>): UploadOptions => ({
  bucket: 'bkt',
  object: 'videos/a/b/c-desktop.mp4',
  source: { kind: 'file', path: file },
  contentType: 'video/mp4',
  cacheControl: 'public, max-age=31536000, immutable, no-transform',
  onExists: 'fail',
  token: SECRET,
  fetch: fetch,
  ...over,
})

describe('uploadObject (#2972)', () => {
  it('starts a resumable upload that is create-only (ifGenerationMatch=0), by POST', async () => {
    const { fetchFn, calls } = fakeGcs()
    await uploadObject(opts({ fetch: fetchFn }))
    const first = calls[0]!
    expect(first.init.method).toBe('POST')
    const url = new URL(first.url)
    expect(url.origin + url.pathname).toBe(
      'https://storage.googleapis.com/upload/storage/v1/b/bkt/o'
    )
    expect(url.searchParams.get('uploadType')).toBe('resumable')
    expect(url.searchParams.get('ifGenerationMatch')).toBe('0')
    expect(url.searchParams.get('name')).toBe('videos/a/b/c-desktop.mp4')
  })

  it('sends the content type and cache control as object metadata, and the bearer token', async () => {
    const { fetchFn, calls } = fakeGcs()
    await uploadObject(opts({ fetch: fetchFn }))
    const first = calls[0]!
    expect(JSON.parse(first.init.body as string)).toEqual({
      name: 'videos/a/b/c-desktop.mp4',
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=31536000, immutable, no-transform',
    })
    const h = first.init.headers as Record<string, string>
    expect(h['Authorization']).toBe(`Bearer ${SECRET}`)
    expect(h['X-Upload-Content-Type']).toBe('video/mp4')
    expect(h['X-Upload-Content-Length']).toBe('11')
  })

  it('PUTs the bytes to the session URL and returns created', async () => {
    const { fetchFn, calls } = fakeGcs()
    expect(await uploadObject(opts({ fetch: fetchFn }))).toBe('created')
    expect(calls).toHaveLength(2)
    expect(calls[1]!.url).toBe(session)
    expect(calls[1]!.init.method).toBe('PUT')
    expect(
      (calls[1]!.init.headers as Record<string, string>)['Content-Length']
    ).toBe('11')
  })

  it('on 412 with onExists=skip returns skipped and sends no bytes', async () => {
    const { fetchFn, calls } = fakeGcs({ initiate: 412 })
    expect(await uploadObject(opts({ fetch: fetchFn, onExists: 'skip' }))).toBe(
      'skipped'
    )
    expect(calls).toHaveLength(1)
  })

  it('on 412 with onExists=fail throws ObjectExistsError', async () => {
    const { fetchFn } = fakeGcs({ initiate: 412 })
    await expect(
      uploadObject(opts({ fetch: fetchFn, onExists: 'fail' }))
    ).rejects.toBeInstanceOf(ObjectExistsError)
  })

  it('treats a 412 on the final PUT (a race) the same way', async () => {
    const { fetchFn } = fakeGcs({ put: 412 })
    await expect(
      uploadObject(opts({ fetch: fetchFn, onExists: 'fail' }))
    ).rejects.toBeInstanceOf(ObjectExistsError)
  })

  it.each([400, 401, 403, 404, 500])(
    'any other failure (%i) throws, even with onExists=skip',
    async status => {
      const { fetchFn } = fakeGcs({ initiate: status })
      await expect(
        uploadObject(opts({ fetch: fetchFn, onExists: 'skip' }))
      ).rejects.toThrow(String(status))
    }
  )

  it('fails when the byte PUT fails', async () => {
    const { fetchFn } = fakeGcs({ put: 503 })
    await expect(
      uploadObject(opts({ fetch: fetchFn, sleep: async () => {} }))
    ).rejects.toThrow('503')
  })

  it('never puts the token in an error message', async () => {
    const { fetchFn } = fakeGcs({ initiate: 403 })
    const err = await uploadObject(opts({ fetch: fetchFn })).catch(e => e)
    expect(String(err.message)).not.toContain(SECRET)
  })

  it('refuses a missing onExists at runtime', async () => {
    const { fetchFn } = fakeGcs()
    await expect(
      uploadObject({
        ...opts({ fetch: fetchFn }),
        onExists: undefined as never,
      })
    ).rejects.toThrow(/onExists/)
  })

  it('reads a staging source with objects.get (alt=media) only after the create check passes', async () => {
    const calls: Call[] = []
    const fetchFn = vi.fn(async (url: string, i: RequestInit) => {
      calls.push({ url, init: i })
      if (i.method === 'POST')
        return new Response('{}', {
          status: 200,
          headers: { Location: session },
        })
      if (i.method === 'PUT') return new Response('{}', { status: 200 })
      return new Response('abcdef', {
        status: 200,
        headers: { 'Content-Length': '6' },
      })
    }) as unknown as typeof fetch
    await uploadObject(
      opts({
        fetch: fetchFn,
        bucket: 'prod',
        source: { kind: 'gcs', bucket: 'stg', object: 'videos/a/b/c.mp4' },
      })
    )
    expect(calls.map(c => c.init.method)).toEqual(['POST', 'GET', 'PUT'])
    const get = calls[1]!
    expect(get.url).toBe(
      'https://storage.googleapis.com/storage/v1/b/stg/o/videos%2Fa%2Fb%2Fc.mp4?alt=media'
    )
    expect(
      (calls[2]!.init.headers as Record<string, string>)['Content-Length']
    ).toBe('6')
  })

  it('does not download the staging source when the destination exists', async () => {
    const calls: Call[] = []
    const fetchFn = vi.fn(async (url: string, i: RequestInit) => {
      calls.push({ url, init: i })
      return new Response('{}', { status: 412 })
    }) as unknown as typeof fetch
    await uploadObject(
      opts({
        fetch: fetchFn,
        onExists: 'skip',
        source: { kind: 'gcs', bucket: 'stg', object: 'x' },
      })
    )
    expect(calls.map(c => c.init.method)).toEqual(['POST'])
  })
})

describe('uploadObject against a real HTTP server (#2972)', () => {
  it('streams the file bytes with a Content-Length through real fetch', async () => {
    const http = await import('node:http')
    let received = ''
    let putLength = ''
    const server = http.createServer((req, res) => {
      if (req.method === 'POST') {
        res.writeHead(200, {
          Location: `http://127.0.0.1:${(server.address() as { port: number }).port}/session`,
        })
        res.end('{}')
        return
      }
      putLength = String(req.headers['content-length'])
      req.on('data', c => (received += c))
      req.on('end', () => {
        res.writeHead(200)
        res.end('{}')
      })
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    const realFetch: typeof fetch = (url, init) =>
      fetch(
        String(url).replace(
          'https://storage.googleapis.com',
          `http://127.0.0.1:${port}`
        ),
        init
      )
    try {
      expect(await uploadObject(opts({ fetch: realFetch }))).toBe('created')
    } finally {
      server.close()
    }
    expect(received).toBe('hello-bytes')
    expect(putLength).toBe('11')
  })
})

describe('objectExists (#2972)', () => {
  const answer = (status: number): typeof fetch =>
    vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch

  it('200 means exists, 404 means absent', async () => {
    expect(await objectExists('b', 'o/x', SECRET, answer(200))).toBe(true)
    expect(await objectExists('b', 'o/x', SECRET, answer(404))).toBe(false)
  })

  it.each([401, 403, 500])('%i is an error, never "absent"', async status => {
    await expect(
      objectExists('b', 'o/x', SECRET, answer(status))
    ).rejects.toThrow(String(status))
  })
})
