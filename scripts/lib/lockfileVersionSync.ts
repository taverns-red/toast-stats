/**
 * Lockfile ↔ workspace version sync guard — Pure Functions (#1574)
 *
 * The root `package-lock.json` records every workspace's version under
 * `packages["<workspace path>"].version`. release-please bumps each
 * workspace's `package.json` on release, but its `node` strategy only rewrites
 * the ROOT entry of the root lock (`version` + `packages[""].version`), so the
 * workspace entries fell one release behind after every release and every
 * `npm install` re-wrote them as unrelated churn.
 *
 * The fix is an `extra-files` entry per workspace in
 * `release-please-config.json` that points a `json` updater at the root lock:
 *
 *   { "type": "json", "path": "/package-lock.json",
 *     "jsonpath": "$.packages['frontend'].version" }
 *
 * (A leading `/` makes an extra-file path repo-root-relative instead of
 * package-relative.) These two predicates guard both halves:
 *   - findLockfileVersionDrift — the lock agrees with every workspace now.
 *   - findMissingLockExtraFiles — every released workspace keeps the lock in
 *     sync on the NEXT release, too (a new workspace can't silently escape).
 */

/** One workspace whose lock entry disagrees with its package.json. */
export interface LockfileDrift {
  path: string
  packageJsonVersion: string
  lockVersion: string | undefined
}

/** Minimal shape of an npm v2/v3 lockfile that this guard reads. */
export interface LockfileLike {
  packages?: Record<string, { version?: string } | undefined>
}

/**
 * Compare each workspace's package.json version against its root-lock entry.
 * A missing lock entry is drift too (lockVersion `undefined`).
 */
export function findLockfileVersionDrift(
  lock: LockfileLike,
  workspaces: ReadonlyArray<{ path: string; version: string }>
): LockfileDrift[] {
  const drift: LockfileDrift[] = []
  for (const ws of workspaces) {
    const lockVersion = lock.packages?.[ws.path]?.version
    if (lockVersion !== ws.version) {
      drift.push({
        path: ws.path,
        packageJsonVersion: ws.version,
        lockVersion,
      })
    }
  }
  return drift
}

/** The jsonpath that targets a workspace's version inside the root lock. */
export function lockVersionJsonPath(workspacePath: string): string {
  return `$.packages['${workspacePath}'].version`
}

interface ExtraFileObject {
  type?: string
  path?: string
  jsonpath?: string
}

/** Minimal shape of release-please-config.json that this guard reads. */
export interface ReleasePleaseConfigLike {
  packages: Record<string, { 'extra-files'?: Array<string | ExtraFileObject> }>
}

const ROOT_LOCK_PATHS = new Set(['/package-lock.json'])

/**
 * Return every non-root release-please package that lacks a `json`
 * extra-file pointing at the root lock's `packages['<path>'].version`.
 * The root package (".") is exempt: release-please's node strategy already
 * updates the root lock's top-level version for it.
 */
export function findMissingLockExtraFiles(
  config: ReleasePleaseConfigLike
): string[] {
  const missing: string[] = []
  for (const [path, pkg] of Object.entries(config.packages)) {
    if (path === '.') continue
    const expected = lockVersionJsonPath(path)
    const ok = (pkg['extra-files'] ?? []).some(
      f =>
        typeof f === 'object' &&
        f.type === 'json' &&
        typeof f.path === 'string' &&
        ROOT_LOCK_PATHS.has(f.path) &&
        f.jsonpath === expected
    )
    if (!ok) missing.push(path)
  }
  return missing
}
