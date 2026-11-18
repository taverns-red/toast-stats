import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

/**
 * #2956 (epic #2872, B1): PR previews deploy to their own Firebase project
 * (`vars.FIREBASE_STAGING_PROJECT`, site `toast-stats-staging`), so the
 * preview identity's Hosting rights can't reach the prod site.
 */

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const PREVIEW_WORKFLOWS = [
  '.github/workflows/pr-preview.yml',
  '.github/workflows/pr-preview-cleanup.yml',
]

describe('preview workflows use the staging Firebase project (#2956)', () => {
  it.each(PREVIEW_WORKFLOWS)('%s names the staging project variable', file => {
    expect(read(file)).toContain('vars.FIREBASE_STAGING_PROJECT')
  })

  it.each(PREVIEW_WORKFLOWS)('%s no longer uses the deployer secrets', file => {
    const text = read(file)
    expect(text).not.toContain('secrets.GCP_SERVICE_ACCOUNT')
    expect(text).not.toContain('secrets.GCP_PROJECT_ID')
  })

  it.each(PREVIEW_WORKFLOWS)(
    '%s targets the toast-stats-staging site',
    file => {
      const text = read(file)
      expect(text).not.toMatch(/--site staging-toast-stats/)
      if (file.endsWith('cleanup.yml')) {
        expect(text).toMatch(/--site toast-stats-staging/)
      }
    }
  )

  it('pr-preview.yml skips the Firebase Auth domain sync', () => {
    expect(read('.github/workflows/pr-preview.yml')).toContain(
      '--no-authorized-domains'
    )
  })

  it('.firebaserc maps the staging target in the staging project', () => {
    const rc = JSON.parse(read('.firebaserc')) as {
      projects: { default: string }
      targets: Record<string, { hosting: Record<string, string[]> }>
    }
    expect(rc.targets['toast-stats-staging']?.hosting['staging']).toEqual([
      'toast-stats-staging',
    ])
    // The prod project keeps its mapping until the old site is retired.
    expect(rc.targets[rc.projects.default]?.hosting['staging']).toEqual([
      'staging-toast-stats',
    ])
  })

  /** The `firebase hosting:channel:<verb>` command, with its continuation lines. */
  const command = (file: string, verb: string): string => {
    const lines = read(file).split('\n')
    const at = lines.findIndex(
      l =>
        !l.trimStart().startsWith('#') &&
        l.includes(`firebase hosting:channel:${verb}`)
    )
    expect(at, `${file} runs channel:${verb}`).toBeGreaterThanOrEqual(0)
    let end = at
    while (lines[end]!.trimEnd().endsWith('\\')) end++
    return lines.slice(at, end + 1).join('\n')
  }

  it.each([
    ['.github/workflows/pr-preview.yml', 'deploy'],
    ['.github/workflows/pr-preview-cleanup.yml', 'delete'],
  ])(
    '%s: channel:%s passes --project from the staging variable',
    (file, verb) => {
      const cmd = command(file, verb)
      expect(cmd).toMatch(
        /--project "\$\{\{ vars\.FIREBASE_STAGING_PROJECT \}\}"/
      )
      expect(cmd).not.toMatch(/toast-stats-prod/)
    }
  )

  it('pr-preview-cleanup.yml fails early on an empty staging project, before the delete', () => {
    const wf = parse(read('.github/workflows/pr-preview-cleanup.yml')) as {
      jobs: {
        cleanup: {
          steps: Array<{ env?: Record<string, unknown>; run?: string }>
        }
      }
    }
    const steps = wf.jobs.cleanup.steps
    const deleteAt = steps.findIndex(s => /channel:delete/.test(s.run ?? ''))
    const guardAt = steps.findIndex(
      s =>
        /vars\.FIREBASE_STAGING_PROJECT/.test(
          String(Object.values(s.env ?? {}))
        ) &&
        /-z\b/.test(s.run ?? '') &&
        /exit 1/.test(s.run ?? '')
    )
    expect(guardAt).toBeGreaterThanOrEqual(0)
    expect(guardAt).toBeLessThan(deleteAt)
  })
})
