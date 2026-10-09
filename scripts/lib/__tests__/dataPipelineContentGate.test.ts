/**
 * Workflow contract: the pre-promotion content gate (#1715, plan S1-4) runs
 * before `Promote staging to production`, and its failure HOLDS promotion
 * through the existing promotion-held issue flow (decision D8). Sourced from
 * the workflow YAML so the glue cannot drift from the tested module.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { PROMOTED_PREFIXES } from '../promotionContentGate.js'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
  'continue-on-error'?: boolean
}

const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
  jobs: Record<string, { steps?: Step[] }>
}
const steps = workflow.jobs.pipeline?.steps ?? []

const indexOf = (pred: (s: Step) => boolean) => steps.findIndex(pred)
const byName = (name: string) => steps.find(s => s.name === name)

const GATE_PASSES = "steps.contentgate.outputs.content_promote == 'true'"
const GATE_FAILS = "steps.contentgate.outputs.content_promote == 'false'"

describe('data-pipeline content gate (#1715)', () => {
  const gateIndex = indexOf(s => s.id === 'contentgate')
  const gate = steps[gateIndex]

  it('has a content gate step that runs the tested module', () => {
    expect(gate).toBeDefined()
    expect(gate?.run).toMatch(/scripts\/promotion-content-gate\.ts/)
  })

  it('runs in every mode that promotes (everything but prune)', () => {
    expect(gate?.if).toBe("steps.mode.outputs.mode != 'prune'")
  })

  it('cannot be silently skipped by continue-on-error', () => {
    expect(gate?.['continue-on-error']).toBeUndefined()
  })

  it('runs before promotion', () => {
    const promoteIndex = indexOf(
      s => s.name === 'Promote staging to production'
    )
    expect(gateIndex).toBeGreaterThanOrEqual(0)
    expect(promoteIndex).toBeGreaterThan(gateIndex)
  })

  it('promotion and the CDN purge both require the gate to pass', () => {
    expect(byName('Promote staging to production')?.if).toContain(GATE_PASSES)
    expect(
      byName('Invalidate CDN cache after promotion (#1294)')?.if
    ).toContain(GATE_PASSES)
  })

  it('a gate failure is reported as a blocked promotion', () => {
    expect(byName('Promotion blocked')?.if).toContain(GATE_FAILS)
  })

  it('feeds the promotion-held alert so a hold files the issue', () => {
    const alert = steps.find(s => s.id === 'promoalert')
    expect(alert?.env?.CONTENT_PROMOTE).toBe(
      '${{ steps.contentgate.outputs.content_promote }}'
    )
    expect(alert?.env?.CONTENT_GATE_FILE).toBeTruthy()
    expect(indexOf(s => s.id === 'promoalert')).toBeGreaterThan(gateIndex)
  })

  it('reads exactly the prefixes promotion copies', () => {
    const run = byName('Promote staging to production')?.run ?? ''
    const copied = [
      ...run.matchAll(/gs:\/\/\$\{GCS_BUCKET\}\/([a-z0-9-]+\/)/g),
    ].map(m => m[1])
    expect([...copied].sort()).toEqual([...PROMOTED_PREFIXES].sort())
  })
})
