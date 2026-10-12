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

import type { Storage } from '@google-cloud/storage'
import type { GateBucket } from './promotionContentGateIo.js'

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
 */
export async function readObjectMedia(
  storage: Storage,
  bucketName: string,
  name: string,
  opts: { decompress: boolean }
): Promise<Buffer> {
  const url =
    `${storage.apiEndpoint}/storage/v1/b/${encodeURIComponent(bucketName)}` +
    `/o/${encodeURIComponent(name)}`
  const request = {
    url,
    params: { alt: 'media' },
    headers: { 'Accept-Encoding': 'gzip' },
    responseType: 'arraybuffer',
    retry: true,
    compress: opts.decompress,
  } as RequestOptions
  const res = await storage.authClient.request<ArrayBuffer>(request)
  return Buffer.from(res.data)
}

/**
 * The bucket the pre-promotion content gate reads through: SDK listing,
 * non-streaming stored-byte reads.
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
