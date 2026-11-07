/**
 * Hosting auto-rollback decision logic (#2492).
 *
 * deploy.yml records the live Hosting version before `firebase deploy`,
 * smokes the core path for ~10 minutes, and re-releases the recorded
 * version when the smoke fails. Every decision in that loop lives in
 * ../hostingRollback.ts and is pinned here; the runners
 * (scripts/hosting-release.ts, scripts/hosting-smoke.ts) are I/O glue.
 */
import { describe, it, expect } from 'vitest'
import {
  buildRollbackIssueBody,
  checkCdnLatest,
  checkDistrictPage,
  checkEntryAsset,
  checkHome,
  checkRender,
  chooseRestoreVersion,
  decideOutcome,
  decideSmoke,
  extractEntryAsset,
  liveVersionFromChannelList,
  siteForTarget,
  type ProbeResult,
  type SmokeAttempt,
} from '../hostingRollback.js'

const SITE = 'toast-stats-prod-6d64a'
const live = (version: string | undefined, site = SITE) => ({
  name: `projects/p/sites/${site}/channels/live`,
  release: version
    ? { version: { name: `projects/p/sites/${site}/versions/${version}` } }
    : undefined,
})
const channelList = (...channels: unknown[]) => ({
  status: 'success',
  result: { channels },
})

describe('siteForTarget', () => {
  const rc = {
    targets: {
      p: { hosting: { production: [SITE], staging: ['staging-toast-stats'] } },
    },
  }
  it('resolves the site id a deploy target maps to in .firebaserc', () => {
    expect(siteForTarget(rc, 'p', 'production')).toBe(SITE)
    expect(siteForTarget(rc, 'p', 'staging')).toBe('staging-toast-stats')
  })
  it('returns null for an unmapped target or project', () => {
    expect(siteForTarget(rc, 'p', 'nope')).toBeNull()
    expect(siteForTarget(rc, 'other', 'production')).toBeNull()
    expect(siteForTarget({}, 'p', 'production')).toBeNull()
  })
})

describe('liveVersionFromChannelList', () => {
  it("returns the live channel's current version id", () => {
    const json = channelList(
      {
        name: `projects/p/sites/${SITE}/channels/pr-12`,
        release: { version: { name: `sites/${SITE}/versions/preview` } },
      },
      live('abc123def')
    )
    expect(liveVersionFromChannelList(json, SITE)).toBe('abc123def')
  })

  it('accepts the sites/… form without a projects/ prefix', () => {
    const json = channelList({
      name: `sites/${SITE}/channels/live`,
      release: { version: { name: `sites/${SITE}/versions/v_9-x` } },
    })
    expect(liveVersionFromChannelList(json, SITE)).toBe('v_9-x')
  })

  it('returns null when the live channel has no release (first deploy)', () => {
    expect(liveVersionFromChannelList(channelList(live(undefined)), SITE)).toBe(
      null
    )
  })

  it("ignores another site's live channel", () => {
    const json = channelList(live('other', 'some-other-site'))
    expect(liveVersionFromChannelList(json, SITE)).toBeNull()
  })

  it('ignores a version that belongs to a different site', () => {
    const json = channelList({
      name: `sites/${SITE}/channels/live`,
      release: { version: { name: 'sites/elsewhere/versions/abc' } },
    })
    expect(liveVersionFromChannelList(json, SITE)).toBeNull()
  })

  it('returns null on a failed or malformed CLI result', () => {
    expect(liveVersionFromChannelList({ status: 'error' }, SITE)).toBeNull()
    expect(liveVersionFromChannelList(null, SITE)).toBeNull()
    expect(liveVersionFromChannelList('nope', SITE)).toBeNull()
  })

  it('rejects a version id that could inject into a shell argument', () => {
    const json = channelList(live('abc;rm -rf /'))
    expect(liveVersionFromChannelList(json, SITE)).toBeNull()
  })
})

describe('chooseRestoreVersion', () => {
  it('restores the version recorded before the deploy', () => {
    expect(chooseRestoreVersion({ previous: 'old1', current: 'new2' })).toEqual(
      { action: 'rollback', versionId: 'old1' }
    )
  })

  it('does nothing when no previous version was recorded', () => {
    const d = chooseRestoreVersion({ previous: null, current: 'new2' })
    expect(d.action).toBe('none')
    expect(d.action === 'none' && d.reason).toMatch(/no previous/i)
  })

  it('does nothing when the deploy did not change the live version', () => {
    const d = chooseRestoreVersion({ previous: 'same', current: 'same' })
    expect(d.action).toBe('none')
    expect(d.action === 'none' && d.reason).toMatch(/did not change/i)
  })

  it('still restores when the current live version is unknown', () => {
    expect(chooseRestoreVersion({ previous: 'old1', current: null })).toEqual({
      action: 'rollback',
      versionId: 'old1',
    })
  })
})

const HTML = (entry: string) =>
  `<!doctype html><html><head>
  <script type="module" crossorigin src="${entry}"></script>
  <link rel="modulepreload" crossorigin href="/assets/vendor-1.js">
  </head><body><div id="root"></div></body></html>`

describe('extractEntryAsset', () => {
  it('finds the Vite module entry script', () => {
    expect(extractEntryAsset(HTML('/assets/index-AbC123.js'))).toBe(
      '/assets/index-AbC123.js'
    )
  })
  it('finds it with attributes in any order', () => {
    expect(
      extractEntryAsset(
        '<script crossorigin src="/assets/index-x.js" type="module"></script>'
      )
    ).toBe('/assets/index-x.js')
  })
  it('ignores inline scripts and the dev entry', () => {
    expect(extractEntryAsset('<script>var a=1</script>')).toBeNull()
    expect(
      extractEntryAsset('<script type="module" src="/src/main.tsx"></script>')
    ).toBeNull()
  })
})

describe('probe checks', () => {
  it('home passes on 200 with the expected entry asset', () => {
    const r = checkHome(
      200,
      HTML('/assets/index-new.js'),
      '/assets/index-new.js'
    )
    expect(r).toMatchObject({ name: 'home', ok: true })
  })
  it('home fails when it serves a different entry asset than the build', () => {
    const r = checkHome(
      200,
      HTML('/assets/index-old.js'),
      '/assets/index-new.js'
    )
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/index-old/)
  })
  it('home passes any entry asset when none is expected (restored release)', () => {
    expect(checkHome(200, HTML('/assets/index-old.js'), null).ok).toBe(true)
  })
  it('home fails on a non-200 or with no entry asset', () => {
    expect(checkHome(503, HTML('/assets/index-new.js'), null).ok).toBe(false)
    expect(checkHome(200, '<html></html>', null).ok).toBe(false)
  })

  it('entry asset must be 200 JavaScript', () => {
    expect(checkEntryAsset(200, 'text/javascript; charset=utf-8').ok).toBe(true)
    expect(checkEntryAsset(200, 'application/javascript').ok).toBe(true)
    expect(checkEntryAsset(404, 'text/javascript').ok).toBe(false)
    // An SPA fallback that serves index.html for a missing chunk.
    expect(checkEntryAsset(200, 'text/html; charset=utf-8').ok).toBe(false)
  })

  it('district page must be the SPA shell with the same entry asset', () => {
    const entry = '/assets/index-new.js'
    expect(checkDistrictPage(200, HTML(entry), entry).ok).toBe(true)
    expect(checkDistrictPage(200, HTML('/assets/index-x.js'), entry).ok).toBe(
      false
    )
    expect(checkDistrictPage(404, HTML(entry), entry).ok).toBe(false)
    expect(
      checkDistrictPage(200, '<html><body>nope</body></html>', entry).ok
    ).toBe(false)
  })

  it('district render needs a heading, no error page and no page errors', () => {
    expect(
      checkRender({ heading: 'District 61', errorPage: false, pageErrors: [] })
        .ok
    ).toBe(true)
    expect(
      checkRender({ heading: null, errorPage: false, pageErrors: [] }).ok
    ).toBe(false)
    expect(
      checkRender({ heading: 'Oops', errorPage: true, pageErrors: [] }).ok
    ).toBe(false)
    const r = checkRender({
      heading: 'District 61',
      errorPage: false,
      pageErrors: ['TypeError: x is undefined'],
    })
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/TypeError/)
  })

  it('cdn latest.json must parse with a YYYY-MM-DD latestSnapshotDate', () => {
    expect(
      checkCdnLatest(200, JSON.stringify({ latestSnapshotDate: '2026-11-06' }))
        .ok
    ).toBe(true)
    expect(checkCdnLatest(200, '{not json').ok).toBe(false)
    expect(checkCdnLatest(200, JSON.stringify({ x: 1 })).ok).toBe(false)
    expect(
      checkCdnLatest(500, JSON.stringify({ latestSnapshotDate: '2026-11-06' }))
        .ok
    ).toBe(false)
  })
})

const ok = (name: ProbeResult['name']): ProbeResult => ({
  name,
  ok: true,
  detail: 'ok',
})
const bad = (name: ProbeResult['name']): ProbeResult => ({
  name,
  ok: false,
  detail: 'broken',
})
const pass = (at: number): SmokeAttempt => ({
  at,
  probes: [ok('home'), ok('cdn-data')],
})
const fail = (at: number): SmokeAttempt => ({
  at,
  probes: [ok('home'), bad('district-render')],
})
const OPTS = { windowMs: 600_000, failuresToFail: 3 }

describe('decideSmoke', () => {
  it('continues while the window is open and checks pass', () => {
    expect(decideSmoke([pass(0), pass(30_000)], OPTS)).toBe('continue')
  })

  it('passes once the window has elapsed and the last attempt passed', () => {
    expect(decideSmoke([pass(0), pass(300_000), pass(600_000)], OPTS)).toBe(
      'pass'
    )
  })

  it('tolerates a transient failure (fewer than N in a row)', () => {
    const a = [pass(0), fail(30_000), fail(60_000), pass(90_000)]
    expect(decideSmoke(a, OPTS)).toBe('continue')
    expect(decideSmoke([...a, pass(600_000)], OPTS)).toBe('pass')
  })

  it('fails as soon as N consecutive attempts fail, without waiting out the window', () => {
    expect(
      decideSmoke([pass(0), fail(30_000), fail(60_000), fail(90_000)], OPTS)
    ).toBe('fail')
  })

  it('fails a release that never passes', () => {
    expect(decideSmoke([fail(0), fail(30_000), fail(60_000)], OPTS)).toBe(
      'fail'
    )
  })

  it('does not pass at the window end while the last attempt is failing', () => {
    expect(decideSmoke([pass(0), fail(600_000)], OPTS)).toBe('continue')
  })

  it('continues with no attempts yet', () => {
    expect(decideSmoke([], OPTS)).toBe('continue')
  })
})

describe('buildRollbackIssueBody', () => {
  const base = {
    site: SITE,
    runUrl: 'https://github.com/o/r/actions/runs/1',
    badVersion: 'new2',
    previousVersion: 'old1',
    failures: ['district-render: TypeError: x', 'home: 503'],
    timings: {
      deployedAt: '2026-11-07T10:00:00Z',
      smokeFailedAt: '2026-11-07T10:01:30Z',
      rollbackStartedAt: '2026-11-07T10:01:31Z',
      rollbackFinishedAt: '2026-11-07T10:01:40Z',
      restoredSmokeAt: '2026-11-07T10:03:40Z',
    },
  }

  it('reports a successful automatic rollback with timings and versions', () => {
    const body = buildRollbackIssueBody({
      ...base,
      outcome: 'restored',
    })
    expect(body).toContain('old1')
    expect(body).toContain('new2')
    expect(body).toContain(base.runUrl)
    expect(body).toContain('district-render: TypeError: x')
    expect(body).toContain('2026-11-07T10:01:40Z')
    expect(body).toMatch(/restored/i)
    expect(body).toContain('docs/runbooks/hosting-auto-rollback.md')
  })

  it('says loudly when the restored release also fails its smoke', () => {
    const body = buildRollbackIssueBody({
      ...base,
      outcome: 'restore-failed-smoke',
    })
    expect(body).toMatch(/still failing/i)
  })

  it('says why nothing was rolled back when the override is on', () => {
    const body = buildRollbackIssueBody({
      ...base,
      outcome: 'skipped-override',
    })
    expect(body).toMatch(/override/i)
    expect(body).toMatch(/not rolled back/i)
  })

  it('says why nothing was rolled back when there was no previous version', () => {
    const body = buildRollbackIssueBody({
      ...base,
      previousVersion: null,
      outcome: 'no-previous-version',
    })
    expect(body).toMatch(/not rolled back/i)
    expect(body).toMatch(/no previous/i)
  })
})

describe('decideOutcome', () => {
  const base = {
    autoRollback: 'on',
    rollbackOutcome: '',
    rolledBack: false,
    restoredHealthy: false,
  }
  it('is skipped-override when the override is on', () => {
    expect(decideOutcome({ ...base, autoRollback: 'off' })).toBe(
      'skipped-override'
    )
  })
  it('is restored when the rollback ran and the restored smoke passed', () => {
    expect(
      decideOutcome({ ...base, rolledBack: true, restoredHealthy: true })
    ).toBe('restored')
  })
  it('is restore-failed-smoke when the restored release also fails', () => {
    expect(decideOutcome({ ...base, rolledBack: true })).toBe(
      'restore-failed-smoke'
    )
  })
  it('is no-previous-version when the runner chose not to roll back', () => {
    expect(
      decideOutcome({ ...base, rollbackOutcome: 'no-previous-version' })
    ).toBe('no-previous-version')
  })
  it('is rollback-error when the rollback did not run or crashed', () => {
    expect(decideOutcome(base)).toBe('rollback-error')
    expect(decideOutcome({ ...base, rollbackOutcome: 'garbage' })).toBe(
      'rollback-error'
    )
  })
})
