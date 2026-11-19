/**
 * snapshots/<date>/reinstatable-clubs.json in the pipeline (#3007).
 *
 * compute-analytics builds the file from the date's suspended-clubs.json and
 * the closed-club index at <cache>/config/closed-club-names.json. Without
 * that index it writes nothing, so every mode that runs compute-analytics
 * must pull it first (sync-stores.sh closed-club-names), and must never push
 * it back: build-identity-history.sh owns it.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'

const REPO = process.cwd()

describe('data-pipeline.yml: the closed-club index is pulled before compute (#3007)', () => {
  const workflow = parseYaml(
    readFileSync(
      path.join(REPO, '.github/workflows/data-pipeline.yml'),
      'utf-8'
    )
  ) as {
    jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
  }
  const steps = workflow.jobs['pipeline']!.steps ?? []
  const index = (re: RegExp) => steps.findIndex(s => re.test(s.run ?? ''))

  for (const mode of ['daily', 'rebuild', 'rescrape', 'rescrape-historical']) {
    it(`${mode}: sync-stores.sh pulls closed-club-names before compute-analytics`, () => {
      const modeSteps = steps.filter(s =>
        (s.name ?? '').startsWith(`[${mode}]`)
      )
      const pull = modeSteps.find(s =>
        /sync-stores\.sh[^\n]*(\\\n[^\n]*)*closed-club-names/.test(s.run ?? '')
      )
      expect(pull, `${mode} pulls the closed-club index`).toBeDefined()
      const pullAt = steps.indexOf(pull!)
      const computeAt = steps.findIndex(
        (s, i) =>
          i >= pullAt &&
          (s.name ?? '').startsWith(`[${mode}]`) &&
          /compute-analytics|process-dates\.sh|COLLECTOR/.test(s.run ?? '')
      )
      expect(computeAt).toBeGreaterThanOrEqual(pullAt)
    })
  }

  it('never pushes it back: it is an input, owned by build-identity-history.sh', () => {
    expect(index(/publish-stores\.sh[^\n]*closed-club-names/)).toBe(-1)
  })
})
