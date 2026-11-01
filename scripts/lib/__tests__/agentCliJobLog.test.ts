/**
 * agent-cli job-log (#2418). Fixtures are the real job 123546188905 (CI
 * Test Suite, run 40901656707, 2026-10-29): its REST job JSON and an excerpt
 * of its raw `actions/jobs/{id}/logs` body, which carries real ESC bytes.
 */
import { describe, it, expect } from 'vitest'
import { stripAnsi } from '../agentCli/ansi.js'
import {
  buildJobReport,
  jobLog,
  parseJobLogTarget,
  parseLogLines,
  type Job,
} from '../agentCli/jobLog.js'
import { fakeRunner, fixture, ok, fail, noSleep } from './agentCliFakes.js'

const JOB = JSON.parse(fixture('job-123546188905.json')) as Job
const RAW = fixture('job-123546188905.log')
const REPO = 'taverns-red/toast-stats'

describe('stripAnsi', () => {
  it('removes real ESC colour codes', () => {
    expect(stripAnsi('\u001b[36;1mnpm run test\u001b[0m')).toBe('npm run test')
  })

  it('removes the literal ^[[..m form gh prints when it sanitises a log', () => {
    expect(stripAnsi('^[[31m1 failed^[[39m^[[2m | ^[[22m')).toBe('1 failed | ')
  })

  it('leaves no ESC byte in the real fixture', () => {
    expect(RAW).toContain('\u001b[')
    expect(stripAnsi(RAW)).not.toContain('\u001b')
  })
})

describe('parseJobLogTarget', () => {
  it('reads a bare id, a run URL and a job URL', () => {
    expect(parseJobLogTarget('41065800046')).toEqual({
      kind: 'id',
      id: '41065800046',
    })
    expect(
      parseJobLogTarget(
        'https://github.com/taverns-red/toast-stats/actions/runs/41065800046'
      )
    ).toEqual({ kind: 'run', id: '41065800046' })
    expect(
      parseJobLogTarget(
        'https://github.com/taverns-red/toast-stats/actions/runs/41065800046/job/124097481335'
      )
    ).toEqual({ kind: 'job', id: '124097481335' })
    expect(parseJobLogTarget('nope')).toBeNull()
  })
})

describe('buildJobReport', () => {
  it('slices to the failed step and keeps its error lines, ANSI-free', () => {
    const r = buildJobReport(JOB, RAW, {})
    expect(r.failedSteps).toEqual([
      { number: 15, name: 'Run frontend tests', conclusion: 'failure' },
    ])
    const text = r.errors.join('\n')
    expect(text).toContain(
      '##[error]AssertionError: expected "vi.fn()" to not be called at all'
    )
    // The multi-line ##[error] body (no timestamps) rides along.
    expect(text).toContain('Number of calls: 3')
    expect(text).toContain('##[error]Process completed with exit code 1.')
    expect(text).not.toContain('\u001b')
    expect(text).not.toMatch(/^\d{4}-\d\d-\d\dT/m)
  })

  it('excludes the previous step and the post-job cleanup', () => {
    const r = buildJobReport(JOB, RAW, { all: true })
    const text = (r.lines ?? []).join('\n')
    expect(text).toContain('Run npm run test --workspace=frontend')
    expect(text).not.toContain('Run npm run test:quarantine:check')
    expect(text).not.toContain('Post job cleanup.')
    expect(text).not.toContain('git version 2.56.0')
  })

  it('parses continuation lines with the previous timestamp', () => {
    const lines = parseLogLines('2026-10-29T15:40:32.1Z first\nsecond\n')
    expect(lines).toEqual([
      { ts: '2026-10-29T15:40:32.1Z', text: 'first', continued: false },
      { ts: '2026-10-29T15:40:32.1Z', text: 'second', continued: true },
    ])
  })
})

describe('jobLog', () => {
  it('fetches a job log with --allow-escape-sequences and retries a 503', async () => {
    const runner = fakeRunner([
      [
        /actions\/jobs\/123546188905\/logs$/,
        [fail('HTTP 503: ServerBusy'), ok(RAW)],
      ],
      [/actions\/jobs\/123546188905$/, ok(JSON.stringify(JOB))],
    ])
    const [r] = await jobLog('123546188905', {
      repo: REPO,
      runner,
      sleep: noSleep,
    })
    expect(r.job.name).toBe('Test Suite')
    const logCalls = runner.calls.filter(c => c.endsWith('/logs'))
    expect(logCalls).toHaveLength(2)
    expect(logCalls[0]).toContain('--allow-escape-sequences')
  })

  it('treats a bare id that is not a job as a run and reads its failed jobs', async () => {
    const runner = fakeRunner([
      [/actions\/jobs\/40901656707$/, fail('gh: Not Found (HTTP 404)')],
      [
        /actions\/runs\/40901656707\/jobs/,
        ok(fixture('run-jobs-40901656707.json')),
      ],
      [/actions\/jobs\/123546188905\/logs$/, ok(RAW)],
    ])
    const reports = await jobLog('40901656707', {
      repo: REPO,
      runner,
      sleep: noSleep,
    })
    expect(reports.map(r => r.job.name)).toEqual(['Test Suite'])
  })

  it('falls back to no flag on a gh that does not know --allow-escape-sequences', async () => {
    const runner = fakeRunner([
      [
        /--allow-escape-sequences/,
        fail('unknown flag: --allow-escape-sequences'),
      ],
      [/actions\/jobs\/123546188905\/logs$/, ok(RAW)],
      [/actions\/jobs\/123546188905$/, ok(JSON.stringify(JOB))],
    ])
    const [r] = await jobLog('123546188905', {
      repo: REPO,
      runner,
      sleep: noSleep,
    })
    expect(r.errors.length).toBeGreaterThan(0)
  })
})
