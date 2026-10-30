// Stale-build chunk-load recovery (#2415). Stub for the red commit.
type GuardStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface ChunkReloadDeps {
  storage?: GuardStorage
  now?: () => number
}

export const CHUNK_RELOAD_WINDOW_MS = 60_000

export function isChunkLoadError(_err: unknown): boolean {
  return false
}

export function claimChunkReload(
  _target: string,
  _deps: ChunkReloadDeps = {}
): boolean {
  return false
}

export function reloadTo(
  _target: string,
  _loc: Pick<Location, 'href' | 'reload' | 'assign'>
): void {}

export const browserNav = {
  reloadTo: (target: string): void => reloadTo(target, window.location),
}

export function installChunkReloadHandler(
  _target: EventTarget,
  _deps: ChunkReloadDeps & {
    currentHref?: () => string
    reload?: (target: string) => void
  } = {}
): () => void {
  return () => {}
}
