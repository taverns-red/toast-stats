/**
 * #2872 (B0): scripts/setup-wif.sh must not grant the roles the deployer
 * identity lost in Step 0 (2026-11-15), because no workflow uses them.
 * Re-running the script would otherwise undo that least-privilege work.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const FILE = path.resolve(process.cwd(), 'scripts/setup-wif.sh')

const REMOVED_ROLES = [
  'roles/run.admin',
  'roles/iam.serviceAccountUser',
  'roles/apigateway.admin',
  'roles/servicemanagement.admin',
  'roles/artifactregistry.writer',
  'roles/cloudbuild.builds.builder',
]

/** Script text with whole-line comments removed, so a note can name a role. */
const code = () =>
  fs
    .readFileSync(FILE, 'utf-8')
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')

describe('setup-wif.sh role grants (#2872 B0)', () => {
  it.each(REMOVED_ROLES)('does not grant %s', role => {
    expect(code()).not.toContain(role)
  })
})
