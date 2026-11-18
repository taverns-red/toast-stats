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
 * Every non-2xx other than the 412 throws; nothing is swallowed. The token is
 * never put in a message. Only global fetch is used.
 */
import { createReadStream, statSync } from 'node:fs'
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
  fetch: typeof fetch
  /** Bytes per PUT. Must be a multiple of 256 KiB in production. */
  chunkSize?: number
  /** Backoff between retries; replaceable so a test need not wait. */
  sleep?: (ms: number) => Promise<void>
}

export type UploadResult = 'created' | 'skipped'

export class ObjectExistsError extends Error {}

const UPLOAD = 'https://storage.googleapis.com/upload/storage/v1/b'
const API = 'https://storage.googleapis.com/storage/v1/b'

const failure = (what: string, res: Response): Error =>
  new Error(`${what} -> ${res.status} ${res.statusText}`.trim())

interface OpenedSource {
  size: number
  body: ReadableStream<Uint8Array>
}

const openSource = async (o: UploadOptions): Promise<OpenedSource> => {
  if (o.source.kind === 'file') {
    return {
      size: statSync(o.source.path).size,
      body: Readable.toWeb(
        createReadStream(o.source.path)
      ) as ReadableStream<Uint8Array>,
    }
  }
  const { bucket, object } = o.source
  const res = await o.fetch(
    `${API}/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}?alt=media`,
    { method: 'GET', headers: { Authorization: `Bearer ${o.token}` } }
  )
  if (!res.ok || !res.body)
    throw failure(`GET gs://${bucket}/${object} (alt=media)`, res)
  const size = Number(res.headers.get('content-length'))
  if (!Number.isInteger(size) || size < 0)
    throw new Error(`GET gs://${bucket}/${object}: no Content-Length`)
  return { size, body: res.body }
}

export const uploadObject = async (o: UploadOptions): Promise<UploadResult> => {
  if (o.onExists !== 'skip' && o.onExists !== 'fail')
    throw new Error("onExists must be 'skip' or 'fail'")
  const target = `gs://${o.bucket}/${o.object}`
  const exists = (): UploadResult => {
    if (o.onExists === 'skip') return 'skipped'
    throw new ObjectExistsError(`${target} already exists`)
  }

  // The destination is checked before the source is read: a 412 here means
  // no bytes are fetched or sent.
  const size =
    o.source.kind === 'file' ? statSync(o.source.path).size : undefined
  const initHeaders: Record<string, string> = {
    Authorization: `Bearer ${o.token}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': o.contentType,
  }
  if (size !== undefined) initHeaders['X-Upload-Content-Length'] = String(size)

  // For a storage source the size is known only after the GET, so the session
  // is opened first and the length is declared on the PUT alone.
  const start = await o.fetch(
    `${UPLOAD}/${encodeURIComponent(o.bucket)}/o?uploadType=resumable` +
      `&name=${encodeURIComponent(o.object)}&ifGenerationMatch=0`,
    {
      method: 'POST',
      headers: initHeaders,
      body: JSON.stringify({
        name: o.object,
        contentType: o.contentType,
        cacheControl: o.cacheControl,
      }),
    }
  )
  if (start.status === 412) return exists()
  if (!start.ok) throw failure(`POST upload ${target}`, start)
  const session = start.headers.get('location')
  if (!session) throw new Error(`POST upload ${target}: no session URL`)

  const src = await openSource(o)
  if (src.size === 0) throw new Error(`${target}: the source is empty`)
  const outcome = await sendChunks(o, session, src, target)
  return outcome === 'exists' ? exists() : 'created'
}

const DEFAULT_CHUNK = 256 * 1024 * 1024 // a multiple of 256 KiB, as GCS requires
const MAX_ATTEMPTS = 5

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
  src: OpenedSource,
  target: string
): Promise<'created' | 'exists'> => {
  const total = src.size
  const chunkSize = o.chunkSize ?? DEFAULT_CHUNK
  const sleep = o.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
  const read = chunkReader(src.body)
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
    const chunk = await read(Math.min(chunkSize, total - offset))
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
