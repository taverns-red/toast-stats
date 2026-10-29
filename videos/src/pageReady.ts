/**
 * Page-ready condition for live-site captures (#2410).
 *
 * The capture used to wait for Playwright's `networkidle` (no request of any
 * kind for 500 ms). The live site loads Google Analytics a few seconds after
 * its data, and the GA library and its `collect` beacons kept `networkidle`
 * from settling inside the 30 s navigation timeout on some runs. PR checks
 * then failed on prod's third-party timing, not on the PR.
 *
 * The readiness signal the capture actually needs is narrower: the
 * scenario's ready element is on the page (it renders from data) and none of
 * the app's own data requests (fetch / xhr to the app origin or the data
 * CDN) is still in flight. Third-party traffic and static assets don't count.
 */

/** The data CDN the app fetches snapshots and config from. */
export const CDN_HOST = 'cdn.taverns.red'

const DATA_RESOURCE_TYPES: ReadonlySet<string> = new Set(['fetch', 'xhr'])

/** The shape of Playwright's `Request` that the tracker reads. */
export interface RequestLike {
  url(): string
  resourceType(): string
}

export interface IdleResult {
  /** True when no data request was in flight before the wait ran out. */
  idle: boolean
  /** URLs of the data requests still in flight when the wait ended. */
  pending: string[]
}

/** True for a fetch / xhr to one of `hosts` (exact host match). */
export function isAppDataRequest(
  url: string,
  resourceType: string,
  hosts: readonly string[]
): boolean {
  if (!DATA_RESOURCE_TYPES.has(resourceType)) return false
  let host: string
  try {
    host = new URL(url).host
  } catch {
    return false
  }
  return hosts.includes(host)
}

/** The hosts whose requests carry a scenario's data. */
export function appDataHosts(scenarioUrl: string): string[] {
  return [new URL(scenarioUrl).host, CDN_HOST]
}

/**
 * Counts the app's in-flight data requests. Wire `onStart` to the page's
 * `request` event and `onEnd` to `requestfinished` and `requestfailed`.
 */
export class DataRequestTracker {
  private readonly inFlight = new Set<RequestLike>()
  private waiters: (() => void)[] = []

  constructor(private readonly hosts: readonly string[]) {}

  onStart(request: RequestLike): void {
    if (isAppDataRequest(request.url(), request.resourceType(), this.hosts)) {
      this.inFlight.add(request)
    }
  }

  onEnd(request: RequestLike): void {
    if (!this.inFlight.delete(request) || this.inFlight.size > 0) return
    const waiters = this.waiters
    this.waiters = []
    for (const wake of waiters) wake()
  }

  pending(): string[] {
    return [...this.inFlight].map(r => r.url())
  }

  /**
   * Resolves once no data request is in flight, or after `timeoutMs` with
   * `idle: false` and the URLs still pending. It never rejects: the caller
   * decides whether a timeout is fatal.
   */
  whenIdle(timeoutMs: number): Promise<IdleResult> {
    if (this.inFlight.size === 0) {
      return Promise.resolve({ idle: true, pending: [] })
    }
    return new Promise(resolve => {
      const wake = (): void => {
        clearTimeout(timer)
        resolve({ idle: true, pending: [] })
      }
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== wake)
        resolve({ idle: false, pending: this.pending() })
      }, timeoutMs)
      this.waiters.push(wake)
    })
  }
}
