/**
 * agent-cli main-status (#2418). Fixtures are real `gh run list --commit`
 * outputs for two main commits: 019ad7f (all green, with repeated scheduled
 * runs) and d8d3fc4 (CI red), plus `gh run view 40901656707 --json jobs`.
 */
import { describe, it, expect } from 'vitest'
import {
  classifyMain,
  formatMainStatus,
  latestPerWorkflow,
  mainStatus,
  mainStatusExitCode,
  type RunSummary,
} from '../agentCli/mainStatus.js'
import { fakeRunner, fixture, ok, noSleep } from './agentCliFakes.js'

const GREEN = JSON.parse(fixture('run-list-main-019ad7f.json')) as RunSummary[]
const RED = JSON.parse(fixture('run-list-main-d8d3fc4.json')) as RunSummary[]
const REPO = 'taverns-red/toast-stats'

function headJson(sha: string): string {
  return JSON.stringify({
    sha,
    message: 'chore: release 2.76.3 (#2417)\n\nbody',
    date: '2026-10-30T14:00:00Z',
  })
}

describe('latestPerWorkflow', () => {
  it('keeps the newest run of each workflow', () => {
    const latest = latestPerWorkflow(GREEN)
    const pipeline = latest.filter(r => r.workflowName === 'Data Pipeline')
    expect(pipeline).toHaveLength(1)
    expect(pipeline[0].databaseId).toBe(41295506275)
    expect(new Set(latest.map(r => r.workflowName)).size).toBe(latest.length)
  })
})

describe('classifyMain', () => {
  it('is green when every latest run succeeded', () => {
    expect(classifyMain(GREEN).state).toBe('green')
  })

  it('is red when the latest CI run failed', () => {
    const c = classifyMain(RED)
    expect(c.state).toBe('red')
    expect(c.failing.map(r => r.workflowName)).toEqual(['CI'])
  })

  it('is pending while a run is in progress, and when no run exists yet', () => {
    const inFlight = [{ ...GREEN[0], status: 'in_progress', conclusion: '' }]
    expect(classifyMain(inFlight).state).toBe('pending')
    expect(classifyMain([]).state).toBe('pending')
  })

  it('red outranks pending', () => {
    const mixed = [...RED, { ...GREEN[0], status: 'queued', conclusion: '' }]
    expect(classifyMain(mixed).state).toBe('red')
  })
})

describe('mainStatus', () => {
  it('names the failing workflow, job and step', async () => {
    const sha = 'd8d3fc44d09ca98c469046fb9aa17119c119bec9'
    const runner = fakeRunner([
      [
        /^gh api repos\/taverns-red\/toast-stats\/commits\/main /,
        ok(headJson(sha)),
      ],
      [new RegExp(`^gh run list .*--commit ${sha}`), ok(JSON.stringify(RED))],
      [/^gh run view 40901656707 /, ok(fixture('run-view-40901656707.json'))],
    ])
    const r = await mainStatus({ repo: REPO, runner, sleep: noSleep })
    expect(r.state).toBe('red')
    expect(r.title).toBe('chore: release 2.76.3 (#2417)')
    const ci = r.workflows.find(w => w.workflowName === 'CI')
    expect(ci?.failedJobs).toEqual([
      {
        name: 'Test Suite',
        url: expect.stringContaining('/job/123546188905'),
        failedSteps: ['Run frontend tests'],
      },
    ])
    expect(mainStatusExitCode(r)).toBe(1)
    const text = formatMainStatus(r)
    expect(text).toMatch(/main d8d3fc4 .*red/)
    expect(text).toContain('Test Suite')
    expect(text).toContain('Run frontend tests')
    // Read-only: nothing but api reads, run list and run view.
    expect(
      runner.calls.every(c => /^gh (api|run list|run view) /.test(c))
    ).toBe(true)
  })

  it('reports green with exit 0 and no job lookups', async () => {
    const sha = '019ad7fa9b18402bfb5491afeb0c146109f267c5'
    const runner = fakeRunner([
      [/commits\/main /, ok(headJson(sha))],
      [/^gh run list /, ok(JSON.stringify(GREEN))],
    ])
    const r = await mainStatus({ repo: REPO, runner, sleep: noSleep })
    expect(r.state).toBe('green')
    expect(mainStatusExitCode(r)).toBe(0)
    expect(runner.calls.some(c => c.startsWith('gh run view'))).toBe(false)
  })
})
