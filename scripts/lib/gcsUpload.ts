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
  const put = await o.fetch(session, {
    method: 'PUT',
    headers: {
      'Content-Type': o.contentType,
      'Content-Length': String(src.size),
    },
    body: src.body,
    // Required by undici for a streamed request body.
    duplex: 'half',
  } as RequestInit)
  if (put.status === 412) return exists()
  if (!put.ok) throw failure(`PUT upload ${target}`, put)
  return 'created'
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
