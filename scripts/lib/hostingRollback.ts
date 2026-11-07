/**
 * Hosting auto-rollback decision logic (#2492).
 *
 * deploy.yml records the live Firebase Hosting version before
 * `firebase deploy`, smokes the core path for ~10 minutes, and on a failed
 * smoke re-releases the recorded version to the live channel. This module
 * holds every decision in that loop as pure functions; the runners
 * (scripts/hosting-release.ts, scripts/hosting-smoke.ts) do the I/O.
 *
 * Mechanism (docs: https://firebase.google.com/docs/hosting/manage-hosting-resources):
 * rolling back "create[s] a new release that serves the same version of
 * content as a previous release". `firebase hosting:clone SITE@VERSION
 * SITE:live` does exactly that within one site: it calls
 * sites.channels.releases.create with versionName=sites/SITE/versions/VERSION
 * (https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.channels.releases/create)
 * — the same call `firebase deploy` makes to release, so the CI identity
 * (Firebase Hosting Admin) needs nothing new.
 *
 * Runbook: docs/runbooks/hosting-auto-rollback.md
 */

export interface ProbeResult {
  name: 'home' | 'entry-asset' | 'district' | 'district-render' | 'cdn-data'
  ok: boolean
  detail: string
}

export interface SmokeAttempt {
  /** ms since the smoke started */
  at: number
  probes: ProbeResult[]
}

export type RestoreDecision =
  { action: 'rollback'; versionId: string } | { action: 'none'; reason: string }

/** A Hosting version id as it may safely appear in a CLI argument. */
const VERSION_ID = /^[A-Za-z0-9_-]+$/

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The site id `.firebaserc` maps a deploy target to, or null. */
export function siteForTarget(
  firebaserc: unknown,
  project: string,
  target: string
): string | null {
  if (!isRecord(firebaserc)) return null
  const targets = firebaserc['targets']
  if (!isRecord(targets)) return null
  const proj = targets[project]
  if (!isRecord(proj) || !isRecord(proj['hosting'])) return null
  const sites = proj['hosting'][target]
  return Array.isArray(sites) && typeof sites[0] === 'string' ? sites[0] : null
}

/**
 * The version id the site's live channel currently serves, from
 * `firebase hosting:channel:list --site SITE --json`, or null when there
 * is none (first deploy) or the result is not a success.
 */
export function liveVersionFromChannelList(
  json: unknown,
  site: string
): string | null {
  if (!isRecord(json) || json['status'] !== 'success') return null
  const result = json['result']
  if (!isRecord(result) || !Array.isArray(result['channels'])) return null
  const liveName = new RegExp(`(^|/)sites/${escape(site)}/channels/live$`)
  for (const ch of result['channels']) {
    if (!isRecord(ch) || typeof ch['name'] !== 'string') continue
    if (!liveName.test(ch['name'])) continue
    const release = ch['release']
    if (!isRecord(release) || !isRecord(release['version'])) return null
    const name = release['version']['name']
    if (typeof name !== 'string') return null
    const m = new RegExp(`(^|/)sites/${escape(site)}/versions/([^/]+)$`).exec(
      name
    )
    const id = m?.[2]
    return id && VERSION_ID.test(id) ? id : null
  }
  return null
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Which version to put back after a failed smoke. */
export function chooseRestoreVersion(v: {
  previous: string | null
  current: string | null
}): RestoreDecision {
  if (!v.previous) {
    return {
      action: 'none',
      reason: 'No previous live version was recorded before the deploy.',
    }
  }
  if (v.previous === v.current) {
    return {
      action: 'none',
      reason:
        'The deploy did not change the live version; it is the recorded one.',
    }
  }
  return { action: 'rollback', versionId: v.previous }
}

/** The Vite module entry (`/assets/….js`) an index.html loads, or null. */
export function extractEntryAsset(html: string): string | null {
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1] ?? ''
    if (!/\btype=["']module["']/i.test(attrs)) continue
    const src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1]
    if (src && /^\/assets\/[^"']+\.js$/.test(src)) return src
  }
  return null
}

const result = (
  name: ProbeResult['name'],
  ok: boolean,
  detail: string
): ProbeResult => ({ name, ok, detail })

/** Home: 200, loads an entry asset, and the expected one when given. */
export function checkHome(
  status: number,
  html: string,
  expectedEntry: string | null
): ProbeResult {
  if (status !== 200) return result('home', false, `HTTP ${status}`)
  const entry = extractEntryAsset(html)
  if (!entry) return result('home', false, 'no module entry asset in the HTML')
  if (expectedEntry && entry !== expectedEntry) {
    return result(
      'home',
      false,
      `serves ${entry}, expected the new build's ${expectedEntry}`
    )
  }
  return result('home', true, `serves ${entry}`)
}

/** The entry asset itself: 200 JavaScript, not an HTML fallback. */
export function checkEntryAsset(
  status: number,
  contentType: string | null
): ProbeResult {
  if (status !== 200) return result('entry-asset', false, `HTTP ${status}`)
  if (!/javascript/i.test(contentType ?? '')) {
    return result(
      'entry-asset',
      false,
      `content-type ${contentType ?? '(none)'}, not JavaScript`
    )
  }
  return result('entry-asset', true, `200 ${contentType}`)
}

/** A district route: 200 SPA shell loading the same entry as home. */
export function checkDistrictPage(
  status: number,
  html: string,
  homeEntry: string | null
): ProbeResult {
  if (status !== 200) return result('district', false, `HTTP ${status}`)
  if (!/<div id=["']root["']/.test(html)) {
    return result('district', false, 'no #root in the HTML')
  }
  const entry = extractEntryAsset(html)
  if (!entry || (homeEntry && entry !== homeEntry)) {
    return result(
      'district',
      false,
      `entry ${entry ?? '(none)'} differs from home's ${homeEntry ?? '(none)'}`
    )
  }
  return result('district', true, `SPA shell with ${entry}`)
}

/** The district page rendered in a browser. */
export function checkRender(r: {
  heading: string | null
  errorPage: boolean
  pageErrors: string[]
}): ProbeResult {
  if (r.pageErrors.length > 0) {
    return result(
      'district-render',
      false,
      `uncaught page error: ${r.pageErrors[0]}`
    )
  }
  if (r.errorPage) {
    return result('district-render', false, 'rendered the error page')
  }
  if (!r.heading) {
    return result('district-render', false, 'no heading rendered')
  }
  return result('district-render', true, `rendered "${r.heading}"`)
}

/** v1/latest.json from the data CDN parses and names a snapshot date. */
export function checkCdnLatest(status: number, body: string): ProbeResult {
  if (status !== 200) return result('cdn-data', false, `HTTP ${status}`)
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return result('cdn-data', false, 'latest.json is not JSON')
  }
  const date = isRecord(json) ? json['latestSnapshotDate'] : undefined
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return result('cdn-data', false, 'no YYYY-MM-DD latestSnapshotDate')
  }
  return result('cdn-data', true, `latestSnapshotDate ${date}`)
}

export interface SmokeOptions {
  /** How long to keep checking a healthy release. */
  windowMs: number
  /** Consecutive failed attempts that fail the release. */
  failuresToFail: number
}

const attemptOk = (a: SmokeAttempt) => a.probes.every(p => p.ok)

/**
 * pass:     the window has elapsed and the latest attempt passed;
 * fail:     the last `failuresToFail` attempts all failed (decided at once,
 *           without waiting out the window);
 * continue: otherwise — including a failing attempt at the window's end
 *           that is not yet `failuresToFail` in a row (bounded: at most
 *           failuresToFail - 1 extra attempts).
 */
export function decideSmoke(
  attempts: SmokeAttempt[],
  opts: SmokeOptions
): 'pass' | 'fail' | 'continue' {
  const last = attempts.at(-1)
  if (!last) return 'continue'
  const tail = attempts.slice(-opts.failuresToFail)
  if (tail.length === opts.failuresToFail && !tail.some(attemptOk)) {
    return 'fail'
  }
  if (last.at >= opts.windowMs && attemptOk(last)) return 'pass'
  return 'continue'
}

export type RollbackOutcome =
  | 'restored'
  | 'restore-failed-smoke'
  | 'rollback-error'
  | 'skipped-override'
  | 'no-previous-version'

/** What the alert reports, from the rollback and restored-smoke steps. */
export function decideOutcome(s: {
  autoRollback: string
  rollbackOutcome: string
  rolledBack: boolean
  restoredHealthy: boolean
}): RollbackOutcome {
  if (s.autoRollback !== 'on') return 'skipped-override'
  if (s.rolledBack) {
    return s.restoredHealthy ? 'restored' : 'restore-failed-smoke'
  }
  if (s.rollbackOutcome === 'no-previous-version') return 'no-previous-version'
  return 'rollback-error'
}

export interface RollbackReport {
  site: string
  runUrl: string
  badVersion: string | null
  previousVersion: string | null
  failures: string[]
  outcome: RollbackOutcome
  timings: Partial<
    Record<
      | 'deployedAt'
      | 'smokeFailedAt'
      | 'rollbackStartedAt'
      | 'rollbackFinishedAt'
      | 'restoredSmokeAt',
      string
    >
  >
}

const OUTCOME_TEXT: Record<RollbackOutcome, string> = {
  restored:
    '✅ **Restored automatically.** The previous version is live again and passed its smoke.',
  'restore-failed-smoke':
    '🚨 **Rolled back, but the site is still failing its smoke.** The cause may not be the release (check the data CDN). A human is needed.',
  'rollback-error':
    '🚨 **The rollback itself failed.** The bad release may still be live. Roll back by hand (runbook below).',
  'skipped-override':
    '⚠️ **Not rolled back: the auto-rollback override is on** (`skip_auto_rollback` input or `HOSTING_AUTO_ROLLBACK=off`). The failing release is still live.',
  'no-previous-version':
    '⚠️ **Not rolled back: no previous live version was recorded before the deploy**, or the deploy did not change it. The failing release is still live.',
}

export function rollbackIssueTitle(site: string): string {
  return `Hosting release failed its smoke on ${site} (auto-rollback)`
}

/** Issue / comment body for a failed post-deploy smoke. */
export function buildRollbackIssueBody(r: RollbackReport): string {
  const t = r.timings
  const row = (label: string, v: string | undefined) =>
    `| ${label} | ${v ?? '—'} |`
  return [
    `## Post-deploy smoke failed on \`${r.site}\``,
    '',
    OUTCOME_TEXT[r.outcome],
    '',
    `- Run: ${r.runUrl}`,
    `- Failing version: \`${r.badVersion ?? 'unknown'}\``,
    `- Previous version: \`${r.previousVersion ?? 'none recorded'}\``,
    '',
    '### Failing checks',
    '',
    ...(r.failures.length
      ? r.failures.map(f => `- ${f}`)
      : ['- (none recorded)']),
    '',
    '### Timings (UTC)',
    '',
    '| Event | Time |',
    '|---|---|',
    row('Deployed', t.deployedAt),
    row('Smoke failed', t.smokeFailedAt),
    row('Rollback started', t.rollbackStartedAt),
    row('Rollback released', t.rollbackFinishedAt),
    row('Restored smoke finished', t.restoredSmokeAt),
    '',
    'How it works, how to override it, and how to roll back by hand:',
    '`docs/runbooks/hosting-auto-rollback.md`.',
    '',
  ].join('\n')
}
