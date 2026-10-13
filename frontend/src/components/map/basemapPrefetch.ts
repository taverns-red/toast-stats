/** Stub (#1943, red step): see the tests. */
export const BASEMAP_HEAD_BYTES = 16384

export interface BasemapHead {
  data: ArrayBuffer
  etag?: string
  cacheControl?: string
  expires?: string
}

export function prefetchBasemapHead(
  _url: string,
  _fetchImpl: typeof fetch = fetch
): Promise<BasemapHead | null> {
  return Promise.resolve(null)
}

export function resetBasemapHeadPrefetch(): void {}
