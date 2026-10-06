import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Hosting-site preflight (#1585).
 *
 * From 2026-10-15 Firebase no longer creates a default Hosting site for new
 * projects; a deploy into a project without its site fails with a generic
 * `404 Site Not Found`. deploy.yml and pr-preview.yml must check the target's
 * site first and fail fast with an actionable `::error::` — without ever
 * creating the site from CI, and without adding a new failure mode when the
 * site exists or the lookup itself errors for another reason.
 *
 * Part 1 runs scripts/check-hosting-site.sh against a stubbed `firebase`.
 * Part 2 pins the workflow wiring as text (no YAML parser at root, cf.
 * releaseGatedDeploy.test.ts).
 */

const ROOT = join(__dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'check-hosting-site.sh')
const PROJECT = 'toast-stats-prod-6d64a'

const STUB = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
case "$1" in
  hosting:sites:get)
    for s in $STUB_EXISTING; do
      if [ "$s" = "$2" ]; then echo "Site ID: $2"; exit 0; fi
    done
    if [ -n "$STUB_GET_ERROR" ]; then
      echo "Error: HTTP Error: 403, The caller does not have permission" >&2
      exit 1
    fi
    echo "Error: could not find site \\"$2\\" for project \\"$4\\"" >&2
    exit 1
    ;;
  *) exit 0 ;;
esac
`

let dir: string
let log: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'site-preflight-'))
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin', 'firebase'), STUB)
  chmodSync(join(dir, 'bin', 'firebase'), 0o755)
  log = join(dir, 'calls.log')
  writeFileSync(log, '')
  copyFileSync(join(ROOT, '.firebaserc'), join(dir, '.firebaserc'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function check(
  target: string,
  opts: { project?: string; existing?: string[]; getError?: boolean } = {}
) {
  const res = spawnSync('bash', [SCRIPT, target], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      PROJECT: opts.project ?? PROJECT,
      FIREBASERC: join(dir, '.firebaserc'),
      STUB_LOG: log,
      STUB_EXISTING: (opts.existing ?? []).join(' '),
      STUB_GET_ERROR: opts.getError ? '1' : '',
    },
  })
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean)
  return { status: res.status, out: `${res.stdout}${res.stderr}`, calls }
}

describe('check-hosting-site.sh (#1585)', () => {
  it('passes when the target site exists, resolving the id from .firebaserc', () => {
    const { status, calls } = check('staging', {
      existing: ['staging-toast-stats'],
    })
    expect(status).toBe(0)
    expect(calls).toEqual([
      `hosting:sites:get staging-toast-stats --project ${PROJECT} --non-interactive`,
    ])
  })

  it('fails fast with an actionable ::error:: when the site is missing', () => {
    const { status, out } = check('production')
    expect(status).toBe(1)
    expect(out).toMatch(
      /::error::Firebase Hosting site 'toast-stats-prod-6d64a' not found in project 'toast-stats-prod-6d64a'/
    )
    expect(out).toMatch(/scripts\/setup-hosting-sites\.sh/)
  })

  it('never creates a site from CI', () => {
    const { calls } = check('production')
    expect(calls.filter(c => c.includes('create'))).toEqual([])
  })

  it('fails with ::error:: when .firebaserc has no mapping for the project', () => {
    const { status, out, calls } = check('production', { project: 'new-proj' })
    expect(status).toBe(1)
    expect(out).toMatch(/::error::No Firebase Hosting site is mapped/)
    expect(calls).toEqual([])
  })

  it('adds no failure mode for other lookup errors (warns, deploy proceeds)', () => {
    const { status, out } = check('production', { getError: true })
    expect(status).toBe(0)
    expect(out).toMatch(/::warning::/)
    expect(out).toMatch(/HTTP Error: 403/)
  })
})

describe('workflow wiring (#1585)', () => {
  const wf = (name: string) =>
    readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8')

  it.each([
    ['deploy.yml', 'production', /firebase deploy --only hosting:production/],
    ['pr-preview.yml', 'staging', /firebase hosting:channel:deploy/],
  ])('%s runs the %s preflight before deploying', (file, target, deployCmd) => {
    const text = wf(file)
    const preflight = text.indexOf(`scripts/check-hosting-site.sh ${target}`)
    expect(preflight, 'preflight step present').toBeGreaterThan(-1)
    expect(preflight).toBeLessThan(text.search(deployCmd))
    expect(text).toMatch(/PROJECT: \$\{\{ secrets\.GCP_PROJECT_ID \}\}/)
    expect(text).not.toMatch(/hosting:sites:create/)
  })
})
