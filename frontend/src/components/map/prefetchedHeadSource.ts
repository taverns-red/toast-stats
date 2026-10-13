/** Stub (#1943, red step): see the tests. */
import type { RangeResponse, Source } from 'pmtiles'
import type { BasemapHead } from './basemapPrefetch'

export class PrefetchedHeadSource implements Source {
  constructor(
    _url: string,
    _head: Promise<BasemapHead | null>,
    private readonly network: Source
  ) {}

  getKey(): string {
    return ''
  }

  getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string
  ): Promise<RangeResponse> {
    return this.network.getBytes(offset, length, signal, etag)
  }
}
