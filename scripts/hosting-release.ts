/**
 * Hosting release runner for the auto-rollback in deploy.yml (#2492).
 *
 *   record   <target>  before `firebase deploy`: the version the live
 *                      channel serves now → $GITHUB_OUTPUT `version`
 *   rollback <target>  after a failed smoke: re-release PREVIOUS_VERSION to
 *                      the live channel with `firebase hosting:clone
 *                      SITE@VERSION SITE:live` (same site, so it creates a
 *                      release of the existing version; no files copied)
 *   report             build the hosting-rollback issue title + body
 *
 * Thin I/O glue: every decision is in ./lib/hostingRollback.ts, unit-tested
 * in scripts/lib/__tests__/hostingRollback.test.ts. Logs go to stderr (R4).
 *
 * Docs:
 *   https://firebase.google.com/docs/hosting/manage-hosting-resources
 *     ("By rolling back, you create a new release that serves the same
 *     version of content as a previous release"; `hosting:clone` with a
 *     `SITE_ID@VERSION_ID` source)
 *   https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.channels.releases/create
 *
 * Env: PROJECT (Firebase project id) for record/rollback;
 *      PREVIOUS_VERSION for rollback; see `report()` for report.
 * Runbook: docs/runbooks/hosting-auto-rollback.md
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildRollbackIssueBody,
  chooseRestoreVersion,
  decideOutcome,
  liveVersionFromChannelList,
  rollbackIssueTitle,
  siteForTarget,
} from './lib/hostingRollback.js'

const ROOT = process.cwd()
const BODY_FILE = join(
  process.env['RUNNER_TEMP'] ?? '/tmp',
  'hosting-rollback-body.md'
)

function output(key: string, value: string): void {
  const out = process.env['GITHUB_OUTPUT']
  if (out) appendFileSync(out, `${key}=${value}\n`)
  console.error(`output ${key}=${value}`)
}

function summary(md: string): void {
  const f = process.env['GITHUB_STEP_SUMMARY']
  if (f) appendFileSync(f, `${md}\n`)
}

const now = () => new Date().toISOString()

function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} must be set`)
  return v
}

function resolveSite(target: string, project: string): string {
  const rc: unknown = JSON.parse(
    readFileSync(join(ROOT, '.firebaserc'), 'utf-8')
  )
  const site = siteForTarget(rc, project, target)
  if (!site) {
    throw new Error(
      `No Hosting site is mapped to target '${target}' for project '${project}' in .firebaserc`
    )
  }
  return site
}

function firebase(args: string[]): string {
  console.error(`$ firebase ${args.join(' ')}`)
  return execFileSync('firebase', args, {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function liveVersion(site: string, project: string): string | null {
  const stdout = firebase([
    'hosting:channel:list',
    '--site',
    site,
    '--project',
    project,
    '--json',
    '--non-interactive',
  ])
  return liveVersionFromChannelList(JSON.parse(stdout), site)
}

function record(target: string): void {
  const project = need('PROJECT')
  const site = resolveSite(target, project)
  const version = liveVersion(site, project)
  output('site', site)
  output('version', version ?? '')
  output('recorded_at', now())
  if (!version) {
    console.error(
      `::warning::No live version recorded for ${site}; an auto-rollback will have nothing to restore.`
    )
  }
  summary(`- Live Hosting version before deploy: \`${version ?? 'none'}\``)
}

function rollback(target: string): void {
  const project = need('PROJECT')
  const site = resolveSite(target, project)
  const previous = process.env['PREVIOUS_VERSION'] || null
  output('started_at', now())
  output('rolled_back', 'false')

  let current: string | null = null
  try {
    current = liveVersion(site, project)
  } catch (err) {
    console.error(
      `could not read the live version before rolling back: ${String(err)}`
    )
  }
  output('bad_version', current ?? '')

  const decision = chooseRestoreVersion({ previous, current })
  if (decision.action === 'none') {
    output('outcome', 'no-previous-version')
    console.error(`::error::Not rolling back ${site}: ${decision.reason}`)
    return
  }

  try {
    firebase([
      'hosting:clone',
      `${site}@${decision.versionId}`,
      `${site}:live`,
      '--project',
      project,
      '--non-interactive',
    ])
    const after = liveVersion(site, project)
    if (after !== decision.versionId) {
      throw new Error(
        `live channel serves ${after ?? 'nothing'} after the clone`
      )
    }
  } catch (err) {
    output('outcome', 'rollback-error')
    output('finished_at', now())
    console.error(
      `::error::Rollback of ${site} to ${decision.versionId} failed: ${String(err)}`
    )
    process.exit(1)
  }
  output('rolled_back', 'true')
  output('version', decision.versionId)
  output('outcome', 'rolled-back')
  output('finished_at', now())
  summary(
    `- 🔁 Rolled ${site} back to \`${decision.versionId}\` (was \`${current ?? 'unknown'}\`)`
  )
}

/** Failure lines from a smoke result file written by hosting-smoke.ts. */
function failuresFrom(file: string | undefined): string[] {
  if (!file) return []
  try {
    const r = JSON.parse(readFileSync(file, 'utf-8')) as { failures?: unknown }
    return Array.isArray(r.failures) ? r.failures.map(String) : []
  } catch {
    return ['(smoke result file missing — the smoke runner may have crashed)']
  }
}

function report(): void {
  const env = (k: string) => process.env[k] || undefined
  const site = env('SITE') ?? 'unknown site'
  const outcome = decideOutcome({
    autoRollback: env('AUTO_ROLLBACK') ?? 'on',
    rollbackOutcome: env('ROLLBACK_OUTCOME') ?? '',
    rolledBack: env('ROLLED_BACK') === 'true',
    restoredHealthy: env('RESTORED_HEALTHY') === 'true',
  })
  const body = buildRollbackIssueBody({
    site,
    runUrl: env('RUN_URL') ?? '',
    badVersion: env('BAD_VERSION') ?? null,
    previousVersion: env('PREVIOUS_VERSION') ?? null,
    failures: failuresFrom(env('SMOKE_RESULT_FILE')),
    outcome,
    timings: {
      deployedAt: env('DEPLOYED_AT'),
      smokeFailedAt: env('SMOKE_FINISHED_AT'),
      rollbackStartedAt: env('ROLLBACK_STARTED_AT'),
      rollbackFinishedAt: env('ROLLBACK_FINISHED_AT'),
      restoredSmokeAt: env('RESTORED_FINISHED_AT'),
    },
  })
  writeFileSync(BODY_FILE, body)
  summary(body)
  output('outcome', outcome)
  output('title', rollbackIssueTitle(site))
  output('body_file', BODY_FILE)
}

const [cmd, target] = process.argv.slice(2)
try {
  if (cmd === 'record' && target) record(target)
  else if (cmd === 'rollback' && target) rollback(target)
  else if (cmd === 'report') report()
  else {
    console.error('usage: hosting-release.ts record|rollback <target> | report')
    process.exit(2)
  }
} catch (err) {
  console.error(`::error::hosting-release ${cmd}: ${String(err)}`)
  process.exit(1)
}
