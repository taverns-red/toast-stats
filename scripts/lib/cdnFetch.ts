/**
 * Fetch one CDN object the way a browser sees it (#1710).
 *
 * `fetch` (undici) peels exactly one `Content-Encoding` layer, the same as a
 * browser. The body is returned as raw bytes so the caller can tell a
 * nested-gzip object (#1702 — still gzip after HTTP decoding) apart from a
 * plain parse error. Never throws: transport errors and non-2xx statuses are
 * reported in the result.
 */

import type { CdnObjectFetch } from './cdnSchemaCanary.js'

const FETCH_TIMEOUT_MS = 20_000

export async function fetchCdnObject(
  baseUrl: string,
  path: string
): Promise<CdnObjectFetch> {
  const url = `${baseUrl}/${path}`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      await res.body?.cancel()
      return { path, ok: false, status: res.status }
    }
    return {
      path,
      ok: true,
      status: res.status,
      body: new Uint8Array(await res.arrayBuffer()),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { path, ok: false, error: message }
  }
}
