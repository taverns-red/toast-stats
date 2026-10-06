import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Behaviour test for scripts/setup-hosting-sites.sh (#1584).
 *
 * From 2026-10-15 Firebase stops creating a default Hosting site for new
 * projects, so a rebuilt environment needs its sites provisioned explicitly.
 * The script must be idempotent (existing sites → no-op), create only the
 * sites that are missing, never create on an ambiguous error, and stay in
 * sync with the deploy targets declared in .firebaserc.
 *
 * The real `firebase` binary is replaced by a stub on PATH that records every
 * invocation and simulates which sites exist, so no cloud resource is touched.
 */

const ROOT = join(__dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'setup-hosting-sites.sh')
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

interface RcFile {
  projects: { default: string }
  targets: Record<string, { hosting: Record<string, string[]> }>
}

function repoRc(): RcFile {
  return JSON.parse(readFileSync(join(ROOT, '.firebaserc'), 'utf8')) as RcFile
}

/** Every site id the repo's .firebaserc maps, across all hosting targets. */
function repoSites(): string[] {
  return Object.values(repoRc().targets[PROJECT].hosting).flat()
}

let dir: string
let log: string
let rc: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hosting-sites-'))
  const bin = join(dir, 'bin')
  spawnSync('mkdir', ['-p', bin])
  writeFileSync(join(bin, 'firebase'), STUB)
  chmodSync(join(bin, 'firebase'), 0o755)
  log = join(dir, 'calls.log')
  writeFileSync(log, '')
  rc = join(dir, '.firebaserc')
  copyFileSync(join(ROOT, '.firebaserc'), rc)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function run(
  args: string[],
  opts: { existing?: string[]; getError?: boolean } = {}
) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      FIREBASERC: rc,
      STUB_LOG: log,
      STUB_EXISTING: (opts.existing ?? []).join(' '),
      STUB_GET_ERROR: opts.getError ? '1' : '',
    },
  })
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean)
  return { status: res.status, out: `${res.stdout}${res.stderr}`, calls }
}

const creates = (calls: string[]) =>
  calls.filter(c => c.startsWith('hosting:sites:create'))
const applies = (calls: string[]) =>
  calls.filter(c => c.startsWith('target:apply'))

describe('setup-hosting-sites.sh (#1584)', () => {
  it('checks every site .firebaserc maps (stays in sync with deploy targets)', () => {
    const { status, calls } = run([], { existing: repoSites() })
    expect(status).toBe(0)
    const checked = calls
      .filter(c => c.startsWith('hosting:sites:get'))
      .map(c => c.split(' ')[1])
    expect(checked.sort()).toEqual(repoSites().sort())
    expect(repoSites().length).toBeGreaterThanOrEqual(2)
  })

  it('is a no-op when every site and target already exists', () => {
    const { status, calls } = run(['--project', PROJECT], {
      existing: repoSites(),
    })
    expect(status).toBe(0)
    expect(creates(calls)).toEqual([])
    expect(applies(calls)).toEqual([])
  })

  it('creates only the missing site, non-interactively, in the given project', () => {
    const { status, calls } = run(['--project', PROJECT], {
      existing: ['toast-stats-prod-6d64a'],
    })
    expect(status).toBe(0)
    expect(creates(calls)).toEqual([
      `hosting:sites:create staging-toast-stats --project ${PROJECT} --non-interactive`,
    ])
  })

  it('--dry-run reports the missing site but creates nothing', () => {
    const { status, out, calls } = run(['--dry-run'], {
      existing: ['toast-stats-prod-6d64a'],
    })
    expect(status).toBe(0)
    expect(creates(calls)).toEqual([])
    expect(out).toMatch(/would create.*staging-toast-stats/i)
  })

  it('fails without creating when the lookup error is not "site not found"', () => {
    const { status, out, calls } = run([], { getError: true })
    expect(status).not.toBe(0)
    expect(creates(calls)).toEqual([])
    expect(out).toMatch(/HTTP Error: 403/)
  })

  it('refuses a new project with no site ids rather than guessing them', () => {
    const { status, out, calls } = run(['--project', 'new-proj'])
    expect(status).not.toBe(0)
    expect(out).toMatch(/--site production=/)
    expect(creates(calls)).toEqual([])
  })

  it('provisions a new project from --site overrides and applies its targets', () => {
    const { status, calls } = run([
      '--project',
      'new-proj',
      '--site',
      'production=new-proj',
      '--site',
      'staging=staging-new-proj',
    ])
    expect(status).toBe(0)
    expect(creates(calls).sort()).toEqual([
      'hosting:sites:create new-proj --project new-proj --non-interactive',
      'hosting:sites:create staging-new-proj --project new-proj --non-interactive',
    ])
    expect(applies(calls).sort()).toEqual([
      'target:apply hosting production new-proj --project new-proj',
      'target:apply hosting staging staging-new-proj --project new-proj',
    ])
  })

  it('refuses to remap a target already bound to a different site', () => {
    const { status, out, calls } = run(
      ['--project', PROJECT, '--site', 'staging=other-site'],
      { existing: [...repoSites(), 'other-site'] }
    )
    expect(status).not.toBe(0)
    expect(out).toMatch(/target:clear hosting staging/)
    expect(creates(calls)).toEqual([])
    expect(applies(calls)).toEqual([])
  })
})
