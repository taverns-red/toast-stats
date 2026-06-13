import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { emitJsonAndExit } from '../cliHelpers.js'

/**
 * #1182 — `process.exit()` terminates synchronously and discards any stdout
 * bytes still buffered for an async pipe, truncating a large summary JSON at
 * the ~64KB highWaterMark when piped through `| tee`/`| jq` (the #1070
 * 768-result dry-run died mid-record, while the same data printed intact to a
 * file). The fix routes every terminal JSON summary through `emitJsonAndExit`,
 * which defers the exit until the stdout write has drained. These tests pin
 * that contract at the unit level (acceptance-criterion-approved) plus a
 * source guard so no command regresses back to the raw
 * `console.log(JSON.stringify(...))` + `process.exit()` footgun.
 */
describe('#1182 stdout flush-before-exit', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let writeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)
  })

  afterEach(() => {
    exitSpy.mockRestore()
    writeSpy?.mockRestore()
  })

  it('does NOT call process.exit synchronously — it waits for the stdout write to drain', () => {
    // Capture the drain callback without firing it.
    let drain: (() => void) | undefined
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      _chunk: unknown,
      cb?: () => void
    ) => {
      drain = cb
      return true
    }) as never)

    emitJsonAndExit({ ok: true }, 3)

    // The exit is queued behind the drain, not fired inline.
    expect(exitSpy).not.toHaveBeenCalled()
    expect(drain).toBeTypeOf('function')

    // Once stdout drains, the deferred exit fires with the right code.
    drain!()
    expect(exitSpy).toHaveBeenCalledWith(3)
  })

  it('writes the FULL payload before exiting — no 64KB truncation — and stays valid JSON', () => {
    const payload = { results: 'x'.repeat(200_000), totalPairs: 768 }
    let written = ''
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: unknown,
      cb?: () => void
    ) => {
      written += String(chunk)
      cb?.() // simulate a fully-drained pipe
      return true
    }) as never)

    emitJsonAndExit(payload, 0)

    expect(written.length).toBeGreaterThan(200_000)
    // Byte-identical to the previous console.log(JSON.stringify(p, null, 2)).
    expect(written).toBe(JSON.stringify(payload, null, 2) + '\n')
    expect(JSON.parse(written)).toEqual(payload)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('guard: cli.ts emits no structured JSON via console.log — every terminal summary routes through emitJsonAndExit', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const cliSrc = readFileSync(join(here, '..', 'cli.ts'), 'utf-8')
    // The exact #1182 footgun: a large stdout write immediately before a
    // synchronous process.exit. Routing through emitJsonAndExit eliminates it.
    const footguns = cliSrc.match(/console\.log\(\s*JSON\.stringify/g) ?? []
    expect(footguns).toEqual([])
  })
})
