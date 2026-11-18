/**
 * Fixtures for the target check (#2974). Each "fails" case is a step the
 * first, loose guard accepted but that does not name its target.
 */

import { describe, it, expect } from 'vitest'
import { targetProblems } from '../workflowTargetCheck.js'

const CDN = { CDN_BASE_URL: 'https://cdn.taverns.red' }

describe('targetProblems', () => {
  it('accepts a script with its target in env', () => {
    expect(targetProblems('npx tsx scripts/check-cdn-schema.ts', CDN)).toEqual(
      []
    )
  })

  it('fails when the target belongs to a different command in the same run', () => {
    const run = [
      'CDN_BASE_URL=https://cdn.taverns.red npx tsx scripts/check-cdn-schema.ts',
      'npx tsx scripts/cdn-compression-check.ts',
    ].join('\n')
    expect(targetProblems(run, {})).toHaveLength(1)
  })

  it('fails hosting-smoke.ts given only --base, which it ignores', () => {
    const run =
      'npx tsx scripts/hosting-smoke.ts --base https://cdn.taverns.red'
    const problems = targetProblems(run, { BASE_URL: 'https://ts.taverns.red' })
    expect(problems).toEqual([expect.stringContaining('CDN_BASE_URL')])
  })

  it('accepts --base for cdn-compression-check.ts', () => {
    const run =
      'npx tsx scripts/cdn-compression-check.ts --base https://cdn.taverns.red'
    expect(targetProblems(run, {})).toEqual([])
  })

  it('fails hosting-smoke.ts without BASE_URL', () => {
    expect(targetProblems('npx tsx scripts/hosting-smoke.ts', CDN)).toEqual([
      expect.stringContaining('BASE_URL'),
    ])
  })

  it('fails check-pipeline-freshness.ts when MANIFEST_URL can be empty', () => {
    expect(
      targetProblems('npx tsx scripts/check-pipeline-freshness.ts', {
        MANIFEST_URL: '${{ inputs.manifest_url }}',
      })
    ).toEqual([expect.stringContaining('MANIFEST_URL')])
  })

  it('accepts MANIFEST_URL with a literal fallback', () => {
    expect(
      targetProblems('npx tsx scripts/check-pipeline-freshness.ts', {
        MANIFEST_URL:
          "${{ inputs.manifest_url || 'https://x.example/m.json' }}",
      })
    ).toEqual([])
  })
})
