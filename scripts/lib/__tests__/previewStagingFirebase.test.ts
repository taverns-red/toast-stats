import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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
})
