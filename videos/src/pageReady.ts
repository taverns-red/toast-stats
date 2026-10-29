/** Placeholder for #2410 (red step): implemented in the next commit. */
export const CDN_HOST = 'cdn.taverns.red'

export interface RequestLike {
  url(): string
  resourceType(): string
}

export interface IdleResult {
  idle: boolean
  pending: string[]
}

export function isAppDataRequest(
  _url: string,
  _resourceType: string,
  _hosts: readonly string[]
): boolean {
  throw new Error('not implemented')
}

export function appDataHosts(_scenarioUrl: string): string[] {
  throw new Error('not implemented')
}

export class DataRequestTracker {
  constructor(private readonly hosts: readonly string[]) {}
  onStart(_request: RequestLike): void {
    throw new Error(`not implemented ${this.hosts.length}`)
  }
  onEnd(_request: RequestLike): void {
    throw new Error('not implemented')
  }
  pending(): string[] {
    throw new Error('not implemented')
  }
  whenIdle(_timeoutMs: number): Promise<IdleResult> {
    throw new Error('not implemented')
  }
}
