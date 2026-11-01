/**
 * agent-cli gh wrapper (#2418): transient GitHub API failures retry with a
 * bounded backoff; everything else fails at once. The transient messages
 * below are the ones sessions in this repo actually hit.
 */
import { describe, it, expect } from 'vitest'
import { isTransientGhError, runGh, CommandError } from '../agentCli/exec.js'
import { fakeRunner, ok, fail } from './agentCliFakes.js'

describe('isTransientGhError', () => {
  it.each([
    'HTTP 503: ServerBusy (https://api.github.com/repos/x/y/actions/jobs/1/logs)',
    'stream error: stream ID 1; CANCEL; received from peer',
    'gh: Server Error (HTTP 500)',
    'HTTP 502: Bad Gateway',
    'read tcp 10.0.0.1:5000->140.82.112.6:443: read: connection reset by peer',
    'Post "https://api.github.com/graphql": net/http: TLS handshake timeout',
    'unexpected EOF',
    'You have exceeded a secondary rate limit',
  ])('treats %s as transient', msg => {
    expect(isTransientGhError(msg)).toBe(true)
  })

  it.each([
    'gh: Not Found (HTTP 404)',
    'HTTP 401: Bad credentials',
    'the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway',
    "no checks reported on the 'feat/x' branch",
  ])('treats %s as permanent', msg => {
    expect(isTransientGhError(msg)).toBe(false)
  })
})

describe('runGh', () => {
  it('retries a 503 ServerBusy with doubling backoff, then returns stdout', async () => {
    const delays: number[] = []
    const runner = fakeRunner([
      [
        /^gh api x$/,
        [
          fail('HTTP 503: ServerBusy'),
          fail('stream error: stream ID 1; CANCEL'),
          ok('done'),
        ],
      ],
    ])
    const out = await runGh(['api', 'x'], {
      runner,
      baseDelayMs: 100,
      sleep: async ms => {
        delays.push(ms)
      },
    })
    expect(out).toBe('done')
    expect(delays).toEqual([100, 200])
  })

  it('gives up after the bounded attempts with the last error', async () => {
    const runner = fakeRunner([[/^gh api x$/, fail('HTTP 503: ServerBusy')]])
    await expect(
      runGh(['api', 'x'], { runner, attempts: 3, sleep: async () => {} })
    ).rejects.toBeInstanceOf(CommandError)
    expect(runner.calls).toHaveLength(3)
  })

  it('does not retry a 404', async () => {
    const runner = fakeRunner([
      [/^gh api x$/, fail('gh: Not Found (HTTP 404)')],
    ])
    await expect(
      runGh(['api', 'x'], { runner, sleep: async () => {} })
    ).rejects.toThrow(/Not Found/)
    expect(runner.calls).toHaveLength(1)
  })
})
