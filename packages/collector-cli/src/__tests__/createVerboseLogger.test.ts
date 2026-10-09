/**
 * createVerboseLogger — the R4 contract (#1687).
 *
 * Every log level goes to stderr (`console.error`). Stdout is reserved for the
 * CLI's structured JSON output (`| tee | jq`), so nothing here may write to
 * `console.log` / `console.info` / `console.warn` / `console.debug` or
 * `process.stdout`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVerboseLogger } from '../createVerboseLogger.js'

describe('createVerboseLogger', () => {
  let stderr: ReturnType<typeof vi.spyOn>
  let stdoutSpies: Array<ReturnType<typeof vi.spyOn>>

  beforeEach(() => {
    stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    stdoutSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true),
    ]
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function expectStdoutUntouched(): void {
    for (const spy of stdoutSpies) {
      expect(spy).not.toHaveBeenCalled()
    }
  }

  it('returns undefined when verbose is off (optional-logger pattern)', () => {
    expect(createVerboseLogger(false)).toBeUndefined()
  })

  it('returns all four level methods when verbose is on', () => {
    const logger = createVerboseLogger(true)
    expect(logger).toBeDefined()
    expect(typeof logger?.info).toBe('function')
    expect(typeof logger?.warn).toBe('function')
    expect(typeof logger?.error).toBe('function')
    expect(typeof logger?.debug).toBe('function')
  })

  it.each([
    ['info', '[INFO]'],
    ['warn', '[WARN]'],
    ['debug', '[DEBUG]'],
  ] as const)(
    '%s writes a %s-prefixed line to stderr with JSON-serialised data',
    (level, prefix) => {
      const logger = createVerboseLogger(true)!
      logger[level]('fetched districts', { count: 3, ids: ['61', 'F'] })

      expect(stderr).toHaveBeenCalledTimes(1)
      expect(stderr).toHaveBeenCalledWith(
        `${prefix} fetched districts`,
        '{"count":3,"ids":["61","F"]}'
      )
      expectStdoutUntouched()
    }
  )

  it.each(['info', 'warn', 'debug'] as const)(
    '%s passes an empty second argument when no data is given',
    level => {
      const logger = createVerboseLogger(true)!
      logger[level]('no payload')

      expect(stderr).toHaveBeenCalledWith(
        expect.stringMatching(/^\[[A-Z]+\] no payload$/),
        ''
      )
      expectStdoutUntouched()
    }
  )

  it('error writes [ERROR] with the Error message (not the stack or object)', () => {
    const logger = createVerboseLogger(true)!
    logger.error('upload failed', new Error('403 Forbidden'))

    expect(stderr).toHaveBeenCalledWith(
      '[ERROR] upload failed',
      '403 Forbidden'
    )
    expectStdoutUntouched()
  })

  // #1708: every writer passes a context object (`{ date, districtId, error }`),
  // and the logger used to print '' for it — the stderr line said what failed
  // but never where or why.
  it('error serialises a context object instead of dropping it', () => {
    const logger = createVerboseLogger(true)!
    logger.error('Failed to write time-series data point', {
      date: '2026-10-01',
      districtId: '61',
      error: 'Unexpected token',
    })

    expect(stderr).toHaveBeenCalledWith(
      '[ERROR] Failed to write time-series data point',
      '{"date":"2026-10-01","districtId":"61","error":"Unexpected token"}'
    )
    expectStdoutUntouched()
  })

  it('error serialises an Error nested in the context as its message', () => {
    const logger = createVerboseLogger(true)!
    logger.error('Failed to write metadata.json', {
      date: '2026-10-01',
      error: new Error('ENOSPC'),
    })

    expect(stderr).toHaveBeenCalledWith(
      '[ERROR] Failed to write metadata.json',
      '{"date":"2026-10-01","error":"ENOSPC"}'
    )
    expectStdoutUntouched()
  })

  it('error serialises a non-object value and prints nothing for undefined', () => {
    const logger = createVerboseLogger(true)!
    logger.error('string failure', 'boom')
    logger.error('bare failure')

    expect(stderr).toHaveBeenNthCalledWith(
      1,
      '[ERROR] string failure',
      '"boom"'
    )
    expect(stderr).toHaveBeenNthCalledWith(2, '[ERROR] bare failure', '')
    expectStdoutUntouched()
  })

  it('error survives a context that cannot be serialised', () => {
    const logger = createVerboseLogger(true)!
    const circular: Record<string, unknown> = { date: '2026-10-01' }
    circular.self = circular

    expect(() => logger.error('odd failure', circular)).not.toThrow()
    expect(stderr).toHaveBeenCalledWith(
      '[ERROR] odd failure',
      '[object Object]'
    )
    expectStdoutUntouched()
  })

  it('never touches stdout across a burst of every level', () => {
    const logger = createVerboseLogger(true)!
    logger.info('a', { x: 1 })
    logger.warn('b')
    logger.debug('c', [1, 2])
    logger.error('d', new Error('e'))

    expect(stderr).toHaveBeenCalledTimes(4)
    expectStdoutUntouched()
  })
})
