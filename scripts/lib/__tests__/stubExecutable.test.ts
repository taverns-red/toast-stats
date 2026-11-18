import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeExecutable, writeStubExecutable } from './stubExecutable.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stub-exec-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const read = (f: string) => readFileSync(f, 'utf8')
const isExec = (f: string) => (statSync(f).mode & 0o111) !== 0

describe('writeStubExecutable (#2998)', () => {
  it('puts the default shebang first and makes the file executable', () => {
    const f = join(dir, 'a')
    writeStubExecutable(f, 'echo hi\n')
    expect(read(f)).toBe('#!/bin/sh\necho hi\n')
    expect(isExec(f)).toBe(true)
  })

  it('uses the shebang it is given', () => {
    const f = join(dir, 'a')
    writeStubExecutable(f, 'echo hi\n', '#!/usr/bin/env bash')
    expect(read(f).startsWith('#!/usr/bin/env bash\n')).toBe(true)
  })

  it('keeps a body that already has a shebang', () => {
    const f = join(dir, 'a')
    writeStubExecutable(f, '#!/usr/bin/env bash\necho hi\n')
    expect(read(f)).toBe('#!/usr/bin/env bash\necho hi\n')
  })

  it('refuses a body shebang that differs from the one given', () => {
    expect(() =>
      writeStubExecutable(join(dir, 'a'), '#!/bin/sh\nx\n', '#!/bin/bash')
    ).toThrow(/shebang/)
  })

  it('refuses a shebang argument without #!', () => {
    expect(() => writeStubExecutable(join(dir, 'a'), 'x\n', 'bash')).toThrow(
      /#!/
    )
  })

  it('makes an existing file executable', () => {
    const f = join(dir, 'a')
    writeStubExecutable(f, 'x\n')
    makeExecutable(f)
    expect(isExec(f)).toBe(true)
  })
})
