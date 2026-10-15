/**
 * Object reads for the pipeline's GCS scripts (#1729).
 *
 * `@google-cloud/storage` 8.2.0's `file.download()` streams through
 * teeny-request, which hands back node-fetch's response body as the
 * response object. The SDK pipes that body into its own stream and also
 * triggers teeny's pipe of the same body, so every download leaves 11
 * `error` and 11 `close` listeners on one body and Node logs two
 * MaxListenersExceededWarnings per object (1,788 lines in run 38057299072).
 * It is per-response and bounded, not a leak, but it buried the gate's
 * output. It is unchanged in storage 8.4.0 / teeny-request 11.1.0.
 *
 * Reading media in one non-streaming request through the client's own
 * authenticated transport (`storage.authClient.request`, gaxios) avoids the
 * double pipe. Retries: gaxios `retry: true` (3 retries on 408/429/5xx for
 * GET), matching the SDK's retry-request default count.
 */

import { writeFile } from 'node:fs/promises'
import type { Storage } from '@google-cloud/storage'
import type { GateBucket } from './promotionContentGateIo.js'
import type { RankHistoryBucket } from './rankHistoryPull.js'
import type {
  StoredObjectMeta,
  StripIo,
  WriteMetadata,
} from './stripClubContact.js'
import type { PruneIo } from './pruneGapDistricts.js'

type RequestOptions = Parameters<Storage['authClient']['request']>[0]

/**
 * One object's media bytes via the JSON API (`?alt=media`).
 *
 * `decompress: false` returns the stored bytes (gzip layer intact), like the
 * SDK's `download({ decompress: false })`. It works by sending
 * `Accept-Encoding: gzip`, so GCS serves gzip-stored objects as stored, and
 * `compress: false`, node-fetch 2's option to leave `Content-Encoding: gzip`
 * bodies undecoded. gaxios 6 passes its options to node-fetch unchanged.
 * gaxios 7 moves to the platform fetch, which always decodes. The
 * gcsMediaListeners test asserts that the stored bytes come back, so that
 * upgrade fails loudly.
 *
 * `generation` pins the read to that generation (404 once it is replaced).
 */
export async function readObjectMedia(
  storage: Storage,
  bucketName: string,
  name: string,
  opts: { decompress: boolean; generation?: string }
): Promise<Buffer> {
  const url =
    `${storage.apiEndpoint}/storage/v1/b/${encodeURIComponent(bucketName)}` +
    `/o/${encodeURIComponent(name)}`
  const request = {
    url,
    params: {
      alt: 'media',
      ...(opts.generation !== undefined ? { generation: opts.generation } : {}),
    },
    headers: { 'Accept-Encoding': 'gzip' },
    responseType: 'arraybuffer',
    retry: true,
    compress: opts.decompress,
  } as RequestOptions
  const res = await storage.authClient.request<ArrayBuffer>(request)
  return Buffer.from(res.data)
}

/**
 * The bucket the pre-promotion content gate and the per-date completeness
 * gate read through: SDK listing, non-streaming stored-byte reads.
 */
export function gateBucket(storage: Storage, bucketName: string): GateBucket {
  const bucket = storage.bucket(bucketName)
  return {
    getFiles: query => bucket.getFiles(query) as Promise<unknown[]>,
    file: name => ({
      download: async () => [
        await readObjectMedia(storage, bucketName, name, { decompress: false }),
      ],
    }),
  }
}

/**
 * The bucket the rank-history pull reads through (#2029): SDK listing,
 * non-streaming reads written to `destination`. `decompress: true` inflates
 * a gzip-stored object, the same bytes the SDK's default
 * `download({ destination })` wrote (#1733 verified those with `cmp`).
 */
export function rankHistoryBucket(
  storage: Storage,
  bucketName: string
): RankHistoryBucket {
  const bucket = storage.bucket(bucketName)
  return {
    getFiles: query => bucket.getFiles(query) as Promise<unknown[]>,
    file: name => ({
      download: async ({ destination }) => {
        const bytes = await readObjectMedia(storage, bucketName, name, {
          decompress: true,
        })
        await writeFile(destination, bytes)
      },
    }),
  }
}

/** The listed fields the contact strip keeps, as strings. */
function toStoredMeta(m: Record<string, unknown>): StoredObjectMeta {
  const str = (v: unknown): string | undefined =>
    v === undefined || v === null ? undefined : String(v)
  const out: StoredObjectMeta = {
    name: String(m.name),
    generation: String(m.generation),
  }
  for (const key of [
    'md5Hash',
    'size',
    'contentType',
    'contentEncoding',
    'cacheControl',
    'contentDisposition',
    'contentLanguage',
  ] as const) {
    const v = str(m[key])
    if (v !== undefined) out[key] = v
  }
  if (m.metadata && typeof m.metadata === 'object') {
    out.metadata = Object.fromEntries(
      Object.entries(m.metadata as Record<string, unknown>).map(([k, v]) => [
        k,
        String(v),
      ])
    )
  }
  return out
}

/**
 * The bucket the one-off contact strip (#2026) works through: SDK listing,
 * generation-pinned non-streaming stored-byte reads, and a single-request
 * upload of the bytes as given (`gzip: false`, so no second layer) carrying
 * the original headers and `ifGenerationMatch`.
 */
export function stripBucket(storage: Storage, bucketName: string): StripIo {
  const bucket = storage.bucket(bucketName)
  return {
    list: async prefix => {
      const [files] = await bucket.getFiles({ prefix })
      return files.map(f =>
        toStoredMeta(f.metadata as unknown as Record<string, unknown>)
      )
    },
    read: (name, generation) =>
      readObjectMedia(storage, bucketName, name, {
        decompress: false,
        generation,
      }),
    write: async (
      name: string,
      bytes: Buffer,
      metadata: WriteMetadata,
      ifGenerationMatch: string
    ) => {
      const file = bucket.file(name)
      await file.save(bytes, {
        resumable: false,
        gzip: false,
        metadata: { ...metadata },
        preconditionOpts: { ifGenerationMatch },
      })
      return toStoredMeta(file.metadata as unknown as Record<string, unknown>)
    },
  }
}

/**
 * The bucket the one-off gap-district prune (#2038) works through: the
 * contact strip's listing and generation-pinned reads, and an object delete
 * conditional on `ifGenerationMatch` (412 when the object was rewritten).
 */
export function pruneBucket(storage: Storage, bucketName: string): PruneIo {
  const { list, read } = stripBucket(storage, bucketName)
  const bucket = storage.bucket(bucketName)
  return {
    list,
    read,
    delete: async (name, ifGenerationMatch) => {
      await bucket.file(name).delete({ ifGenerationMatch })
    },
  }
}
