/**
 * #2972: create-only object upload over the Cloud Storage JSON API.
 *
 * Replaces `gcloud storage cp` for the media identity. `cp` to a new object
 * reads the destination and lists a prefix first, and the media identity holds
 * neither. A direct insert needs only storage.objects.create.
 *
 * Protocol (resumable, so a multi-GB basemap and a small mp4 share one path):
 *   1. POST /upload/storage/v1/b/{bucket}/o?uploadType=resumable
 *        &name={object}&ifGenerationMatch=0
 *      with the object metadata as JSON. ifGenerationMatch=0 makes the call
 *      create-only; an existing object answers 412. 200 returns a session URL
 *      in the Location header.
 *   2. PUT the bytes to the session URL in one request (Content-Length set).
 *      A 412 here is the same race, reported at the end.
 * Docs: https://docs.cloud.google.com/storage/docs/json_api/v1/objects/insert
 *       https://docs.cloud.google.com/storage/docs/resumable-uploads
 *
 * Integrity: the initiation metadata carries md5Hash (the source object's for
 * a copy, a computed one for a file) and the final response must echo it. A
 * copy reads the source with one ranged GET per chunk, retrying that chunk
 * alone, and refuses a source with Content-Encoding set.
 * The session URL is its own authorisation (it lasts a week); the token is
 * used only at initiation and for the source reads.
 *
 * onExists=skip meets an existing object (412) by reading its md5Hash
 * (objects.get on the destination) and skipping only if it equals the
 * source's; a mismatch, a missing md5 or a failed read throws.
 *
 * Every non-2xx other than the 412 throws; nothing is swallowed. The token is
 * never put in a message. Only global fetch is used.
 */
import { createReadStream, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

export type OnExists = 'skip' | 'fail'

export type UploadSource =
  | { kind: 'file'; path: string }
  | { kind: 'gcs'; bucket: string; object: string }

export interface UploadOptions {
  bucket: string
  object: string
  source: UploadSource
  contentType: string
  cacheControl: string
  /** Required, no default: each call site decides what "already there" means. */
  onExists: OnExists
  token: string
  /**
   * Mints a fresh access token (#2980). Without it a 401 is fatal and the
   * token is never renewed.
   */
  tokenProvider?: () => Promise<string>
  /** Renew the token before a source GET once it is older than this. */
  tokenMaxAgeMs?: number
  /** Clock for token age; replaceable so a test need not wait. */
  now?: () => number
  fetch: typeof fetch
  /** Bytes per PUT. Must be a multiple of 256 KiB in production. */
  chunkSize?: number
  /** Backoff between retries; replaceable so a test need not wait. */
  sleep?: (ms: number) => Promise<void>
}

export type UploadResult = 'created' | 'skipped'

export class ObjectExistsError extends Error {}

/** A source read that retrying cannot fix (403, 404, ...). */
class FatalReadError extends Error {}

const UPLOAD = 'https://storage.googleapis.com/upload/storage/v1/b'
const API = 'https://storage.googleapis.com/storage/v1/b'

const failure = (what: string, res: Response): Error =>
  new Error(`${what} -> ${res.status} ${res.statusText}`.trim())

interface PreparedSource {
  size: number
  /** Base64 MD5, as GCS reports it. */
  md5: string
  /** Bytes [offset, offset + n). A file source must be read in order. */
  read: (offset: number, n: number) => Promise<Buffer>
}

const DEFAULT_CHUNK = 256 * 1024 * 1024 // a multiple of 256 KiB, as GCS requires
const MAX_ATTEMPTS = 5
const retryableStatus = (status: number): boolean =>
  status >= 500 || status === 408 || status === 429

/**
 * gcloud owns the token cache: `print-access-token` returns the cached token
 * and only refreshes it within 5 minutes of expiry. Asking for a new one
 * every 30 minutes would just return the same token. So we ask at least every
 * 4 minutes, which is sure to land inside that 5-minute window before the
 * hour is up. A 401 still re-mints once as the backstop.
 */
const DEFAULT_TOKEN_MAX_AGE_MS = 4 * 60_000

/**
 * The bearer token for the source reads and the initiation. With a
 * tokenProvider it is renewed before a read once it is older than
 * tokenMaxAgeMs, and on demand after a 401. The token is held here and only
 * ever placed in an Authorization header, never in a message.
 */
interface Auth {
  header: () => Promise<string>
  /** Mints a new token; false when there is no provider to ask. */
  renew: () => Promise<boolean>
}

const makeAuth = (o: UploadOptions): Auth => {
  const now = o.now ?? Date.now
  const maxAge = o.tokenMaxAgeMs ?? DEFAULT_TOKEN_MAX_AGE_MS
  let token = o.token
  let mintedAt = now()
  const mint = async (): Promise<void> => {
    try {
      token = await o.tokenProvider!()
    } catch {
      // The provider's message is not copied: it could carry a credential.
      throw new FatalReadError('could not mint a fresh access token')
    }
    mintedAt = now()
  }
  return {
    header: async () => {
      if (o.tokenProvider && now() - mintedAt >= maxAge) await mint()
      return `Bearer ${token}`
    },
    renew: async () => {
      if (!o.tokenProvider) return false
      await mint()
      return true
    },
  }
}

const md5OfFile = (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('md5')
    createReadStream(path)
      .on('data', c => hash.update(c))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('base64')))
  })

const fileSource = async (path: string): Promise<PreparedSource> => {
  const size = statSync(path).size
  const md5 = await md5OfFile(path)
  let reader: ReturnType<typeof chunkReader> | undefined
  return {
    size,
    md5,
    read: (_offset, n) => {
      reader ??= chunkReader(
        Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>
      )
      return reader(n)
    },
  }
}

/**
 * One ranged GET per chunk (Range header), so a dropped source connection
 * retries that chunk and not the whole object. The upload session URL needs no
 * token; only these GETs do.
 */
const rangedRead =
  (
    o: UploadOptions,
    auth: Auth,
    bucket: string,
    object: string,
    size: number
  ) =>
  async (offset: number, n: number): Promise<Buffer> => {
    const sleep = o.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
    const what = `GET gs://${bucket}/${object} bytes ${offset}-${offset + n - 1}`
    let renewed = false // one re-mint per chunk; a second 401 is fatal
    for (let attempt = 1; ; attempt++) {
      let problem: string
      try {
        const res = await o.fetch(
          `${API}/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}?alt=media`,
          {
            method: 'GET',
            headers: {
              Authorization: await auth.header(),
              Range: `bytes=${offset}-${offset + n - 1}`,
            },
          }
        )
        if (res.status === 401 && !renewed && (await auth.renew())) {
          await res.body?.cancel() // free the connection before the retry
          renewed = true
          attempt-- // the re-mint is not a failed attempt
          continue
        }
        const whole = res.status === 200 && offset === 0 && n === size
        if (res.status !== 206 && !whole && !retryableStatus(res.status))
          throw new FatalReadError(
            `${what} -> ${res.status} ${res.statusText}`.trim()
          )
        if (res.status === 206) {
          // The bytes must be the ones asked for: a 206 for another offset
          // would write the wrong data under a correct length.
          const m = /^bytes (\d+)-\d+\/(?:\d+|\*)$/.exec(
            res.headers.get('content-range') ?? ''
          )
          if (!m || Number(m[1]) !== offset)
            throw new FatalReadError(
              `${what} -> 206 with a wrong Content-Range`
            )
        }
        if (res.status === 206 || whole) {
          const buf = Buffer.from(await res.arrayBuffer())
          if (buf.length === n) return buf
          problem = `got ${buf.length} bytes, wanted ${n}`
        } else {
          problem = `${res.status} ${res.statusText}`.trim()
        }
      } catch (err) {
        if (err instanceof FatalReadError) throw err
        problem = err instanceof Error ? err.message : String(err)
      }
      if (attempt >= MAX_ATTEMPTS) throw new Error(`${what} -> ${problem}`)
      await sleep(2 ** attempt * 500)
    }
  }

const gcsSource = async (
  o: UploadOptions,
  auth: Auth,
  bucket: string,
  object: string
): Promise<PreparedSource> => {
  const res = await o.fetch(
    `${API}/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}` +
      '?fields=size,md5Hash,contentEncoding',
    { method: 'GET', headers: { Authorization: await auth.header() } }
  )
  if (!res.ok) throw failure(`GET gs://${bucket}/${object} (metadata)`, res)
  const meta = (await res.json()) as {
    size?: string
    md5Hash?: string
    contentEncoding?: string
  }
  if (meta.contentEncoding)
    throw new Error(
      `gs://${bucket}/${object} has Content-Encoding ${meta.contentEncoding}; ` +
        'fetch would decompress it, so it cannot be copied byte for byte'
    )
  const size = Number(meta.size)
  if (!Number.isInteger(size) || size < 0 || !meta.md5Hash)
    throw new Error(`gs://${bucket}/${object}: no size or md5Hash in metadata`)
  return {
    size,
    md5: meta.md5Hash,
    read: rangedRead(o, auth, bucket, object, size),
  }
}

export const uploadObject = async (o: UploadOptions): Promise<UploadResult> => {
  if (o.onExists !== 'skip' && o.onExists !== 'fail')
    throw new Error("onExists must be 'skip' or 'fail'")
  const target = `gs://${o.bucket}/${o.object}`
  const auth = makeAuth(o)
  const exists = async (src: PreparedSource): Promise<UploadResult> => {
    if (o.onExists !== 'skip')
      throw new ObjectExistsError(`${target} already exists`)
    // A skip must not hide a different object: compare what is there with
    // what we would have written. Any doubt is an error.
    const res = await o.fetch(
      `${API}/${encodeURIComponent(o.bucket)}/o/${encodeURIComponent(o.object)}?fields=md5Hash`,
      { method: 'GET', headers: { Authorization: await auth.header() } }
    )
    if (!res.ok) throw failure(`GET ${target} (metadata, to compare)`, res)
    const have = ((await res.json()) as { md5Hash?: string }).md5Hash
    if (!have || !src.md5)
      throw new Error(
        `${target} already exists but its md5Hash cannot be compared; not skipping`
      )
    if (have !== src.md5)
      throw new Error(
        `${target} already exists and differs from the source ` +
          `(md5 ${have}, expected ${src.md5}); not skipping`
      )
    return 'skipped'
  }

  // Size and md5 are known before the session opens, so the initiation can
  // declare both. Only metadata is read here; no bytes move until the
  // create-only check has passed.
  const src =
    o.source.kind === 'file'
      ? await fileSource(o.source.path)
      : await gcsSource(o, auth, o.source.bucket, o.source.object)
  if (src.size === 0) throw new Error(`${target}: the source is empty`)

  const start = await o.fetch(
    `${UPLOAD}/${encodeURIComponent(o.bucket)}/o?uploadType=resumable` +
      `&name=${encodeURIComponent(o.object)}&ifGenerationMatch=0`,
    {
      method: 'POST',
      headers: {
        Authorization: await auth.header(),
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': o.contentType,
        'X-Upload-Content-Length': String(src.size),
      },
      body: JSON.stringify({
        name: o.object,
        contentType: o.contentType,
        cacheControl: o.cacheControl,
        md5Hash: src.md5,
      }),
    }
  )
  if (start.status === 412) return exists(src)
  if (!start.ok) throw failure(`POST upload ${target}`, start)
  const session = start.headers.get('location')
  if (!session) throw new Error(`POST upload ${target}: no session URL`)

  const outcome = await sendChunks(o, session, src, target)
  return outcome === 'exists' ? exists(src) : 'created'
}

/** Reads exactly n bytes (or what is left) from a web stream, in order. */
const chunkReader = (body: ReadableStream<Uint8Array>) => {
  const reader = body.getReader()
  let spare: Buffer = Buffer.alloc(0)
  return async (n: number): Promise<Buffer> => {
    const parts: Buffer[] = []
    let have = 0
    if (spare.length > 0) {
      parts.push(spare)
      have = spare.length
      spare = Buffer.alloc(0)
    }
    while (have < n) {
      const { value, done } = await reader.read()
      if (done) break
      parts.push(Buffer.from(value))
      have += value.length
    }
    const all = Buffer.concat(parts, have)
    spare = all.subarray(n)
    return all.subarray(0, n)
  }
}

/** The finished object must carry the md5Hash declared at initiation. */
const checkFinal = async (
  res: Response,
  expected: string,
  target: string
): Promise<void> => {
  let got: unknown
  try {
    got = ((await res.json()) as { md5Hash?: unknown }).md5Hash
  } catch {
    got = undefined
  }
  if (got !== expected)
    throw new Error(
      `PUT upload ${target}: md5Hash mismatch (expected ${expected}, got ${String(got)})`
    )
}

/** Bytes the session holds, from a 308's Range header ("bytes=0-N"). */
const persistedFrom = (res: Response): number => {
  const m = /^bytes=0-(\d+)$/.exec(res.headers.get('range') ?? '')
  return m ? Number(m[1]) + 1 : 0
}

/**
 * PUTs the source in chunks. After a network error or a 5xx/408/429 it asks
 * the session what it holds (PUT with `Content-Range: bytes * / total`) and
 * resends only the rest, up to MAX_ATTEMPTS per chunk. Any other non-2xx
 * (412 aside) throws at once.
 */
const sendChunks = async (
  o: UploadOptions,
  session: string,
  src: PreparedSource,
  target: string
): Promise<'created' | 'exists'> => {
  const total = src.size
  const chunkSize = o.chunkSize ?? DEFAULT_CHUNK
  const sleep = o.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
  const put = (range: string, body?: Buffer): Promise<Response> =>
    o.fetch(session, {
      method: 'PUT',
      // 308 is GCS's "resume incomplete", not a redirect.
      redirect: 'manual',
      headers: {
        'Content-Type': o.contentType,
        'Content-Length': String(body?.length ?? 0),
        'Content-Range': range,
      },
      body: body as unknown as BodyInit | undefined,
    })

  let offset = 0
  while (offset < total) {
    const chunk = await src.read(offset, Math.min(chunkSize, total - offset))
    if (chunk.length !== Math.min(chunkSize, total - offset))
      throw new Error(`${target}: the source ended early at ${offset}`)
    const end = offset + chunk.length
    let sent = offset // first byte of this chunk the session lacks
    for (let attempt = 1; ; attempt++) {
      let res: Response | undefined
      let netError: unknown
      try {
        res = await put(
          `bytes ${sent}-${end - 1}/${total}`,
          chunk.subarray(sent - offset)
        )
      } catch (err) {
        netError = err
      }
      if (res && res.status === 412) return 'exists'
      if (res && (res.status === 200 || res.status === 201)) {
        if (end < total)
          throw new Error(`PUT upload ${target}: finished before the last byte`)
        await checkFinal(res, src.md5, target)
        return 'created'
      }
      if (res && res.status === 308) {
        sent = Math.max(sent, Math.min(end, persistedFrom(res)))
        if (sent >= end) break
        if (attempt >= MAX_ATTEMPTS)
          throw new Error(`PUT upload ${target}: chunk stalled at ${sent}`)
        continue
      }
      const retryable =
        netError !== undefined ||
        (res !== undefined &&
          (res.status >= 500 || res.status === 408 || res.status === 429))
      if (!retryable) throw failure(`PUT upload ${target}`, res!)
      if (attempt >= MAX_ATTEMPTS)
        throw netError instanceof Error
          ? new Error(`PUT upload ${target}: ${netError.message}`)
          : failure(`PUT upload ${target}`, res!)
      await sleep(2 ** attempt * 500)
      // What does the session hold? A 308 says; a 200/201 says it is done.
      let q: Response
      try {
        q = await put(`bytes */${total}`)
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS) throw err
        continue
      }
      if (q.status === 412) return 'exists'
      if (q.status === 200 || q.status === 201) {
        if (end < total)
          throw new Error(`PUT upload ${target}: finished before the last byte`)
        await checkFinal(q, src.md5, target)
        return 'created'
      }
      if (q.status === 308) {
        sent = Math.max(sent, Math.min(end, persistedFrom(q)))
        if (sent >= end) break
      }
    }
    offset = end
  }
  throw new Error(`PUT upload ${target}: the session never reported completion`)
}

/** Whether an object exists: 200 yes, 404 no, anything else throws. */
export const objectExists = async (
  bucket: string,
  object: string,
  token: string,
  fetchFn: typeof fetch
): Promise<boolean> => {
  const res = await fetchFn(
    `${API}/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}?fields=name`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  )
  if (res.status === 404) return false
  if (!res.ok) throw failure(`GET gs://${bucket}/${object}`, res)
  return true
}
