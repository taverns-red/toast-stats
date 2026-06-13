import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { exitAfterStdoutFlush } from '../cliHelpers.js'

/**
 * #1182 — `process.exit()` terminates synchronously and discards any stdout
 * bytes still buffered for an async pipe, truncating a large summary JSON at
 * the ~64KB highWaterMark when piped through `| tee`/`| jq` (the #1070
 * 768-result dry-run died mid-record). The fix: defer the exit until the
 * stdout write has drained. These tests pin that contract at the unit level
 * (acceptance-criterion-approved) plus a source guard so no exit path
 * regresses back to a raw synchronous `process.exit`.
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

  it('does NOT call process.exit synchronously — it waits for the stdout write callback', () => {
    // Capture the write callback without actually flushing.
    let flush: (() => void) | undefined
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      _chunk: unknown,
      cb?: () => void
    ) => {
      flush = cb
      return true
    }) as never)

    exitAfterStdoutFlush(3)

    // The exit is queued behind the flush, not fired inline.
    expect(exitSpy).not.toHaveBeenCalled()
    expect(flush).toBeTypeOf('function')

    // Once stdout drains, the deferred exit fires with the right code.
    flush!()
    expect(exitSpy).toHaveBeenCalledWith(3)
  })

  it('emits the FULL payload before exiting — no 64KB truncation', () => {
    const big = JSON.stringify({ results: 'x'.repeat(200_000) })
    const chunks: string[] = []
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: unknown,
      cb?: () => void
    ) => {
      chunks.push(String(chunk))
      cb?.() // simulate a fully-drained pipe
      return true
    }) as never)

    process.stdout.write(big)
    exitAfterStdoutFlush(0)

    expect(chunks.join('')).toContain(big)
    expect(chunks.join('')).toHaveLength(big.length + 0) // flush write is empty
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('guard: cli.ts has no raw process.exit() — every exit path drains stdout first', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const cliSrc = readFileSync(join(here, '..', 'cli.ts'), 'utf-8')
    const rawExits = cliSrc.match(/process\.exit\(/g) ?? []
    expect(rawExits).toEqual([])
  })
})
