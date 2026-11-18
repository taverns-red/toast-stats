/**
 * #2955 (epic #2872, Step D): the legacy shared deploy identity is gone.
 * Every workflow signs in with a per-job `vars.GCP_*_SA` variable, so the old
 * repository secret must not appear anywhere under .github/workflows/ (code or
 * comments), and the identity map must not list it as a known identity.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as identityMap from '../gcpIdentityMap'

const WORKFLOWS = path.resolve(process.cwd(), '.github/workflows')

// GitHub expression contexts are case-insensitive, so
// `secrets.gcp_service_account` reads the same secret.
const namesLegacyIdentity = (text: string): boolean =>
  /gcp_service_account/i.test(text)

describe('legacy deploy identity is gone (#2955)', () => {
  it('matches the secret name in any case', () => {
    expect(namesLegacyIdentity('${{ secrets.GCP_SERVICE_ACCOUNT }}')).toBe(true)
    expect(namesLegacyIdentity('${{ secrets.gcp_service_account }}')).toBe(true)
    expect(namesLegacyIdentity('${{ vars.GCP_HOSTING_DEPLOY_SA }}')).toBe(false)
  })

  it('is named in no file under .github/workflows/', () => {
    const offenders = fs
      .readdirSync(WORKFLOWS)
      .filter(f => fs.statSync(path.join(WORKFLOWS, f)).isFile())
      .filter(f =>
        namesLegacyIdentity(fs.readFileSync(path.join(WORKFLOWS, f), 'utf-8'))
      )
    expect(offenders).toEqual([])
  })

  it('is not exported or listed by the identity map', () => {
    expect(Object.keys(identityMap)).not.toContain('DEPLOYER')
    expect(
      identityMap.KNOWN_IDENTITIES.filter(id => /GCP_SERVICE_ACCOUNT/.test(id))
    ).toEqual([])
  })
})
