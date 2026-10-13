/**
 * PrefetchedHeadSource — a pmtiles `Source` that answers reads inside the
 * prefetched archive head from memory (#1943).
 *
 * The header read (bytes 0–16383) and the first leaf directory, which in the
 * world z0–10 build is bytes 2019–13173, both fall inside the head that
 * `prefetchBasemapHead` started while MapLibre was loading. Every other read,
 * and every read when the prefetch failed or the caller expects another
 * etag, goes to the wrapped network source unchanged, so pmtiles' etag and
 * error handling stay its own.
 */
import type { RangeResponse, Source } from 'pmtiles'
import type { BasemapHead } from './basemapPrefetch'

export class PrefetchedHeadSource implements Source {
  constructor(
    private readonly url: string,
    private readonly head: Promise<BasemapHead | null>,
    private readonly network: Source
  ) {}

  getKey(): string {
    return this.url
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string
  ): Promise<RangeResponse> {
    const head = await this.head
    const inside = head && offset + length <= head.data.byteLength
    const sameArchive = !etag || !head?.etag || etag === head.etag
    if (!head || !inside || !sameArchive) {
      return this.network.getBytes(offset, length, signal, etag)
    }
    // A copy: pmtiles may hand the buffer on (transfer to the worker).
    return { ...head, data: head.data.slice(offset, offset + length) }
  }
}
