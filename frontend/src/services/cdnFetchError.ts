/** A CDN read that came back with a non-OK status, so callers can tell a 404 from an outage. */
export class CdnFetchError extends Error {
  readonly status: number

  constructor(status: number, url: string) {
    super(`CDN fetch failed: ${status} for ${url}`)
    this.name = 'CdnFetchError'
    this.status = status
  }
}
