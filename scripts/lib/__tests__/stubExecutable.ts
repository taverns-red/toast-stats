/**
 * The one way a script test makes an executable stub (#2998).
 *
 * A stub with no `#!` line makes bash fall back to interpreting the file
 * itself after ENOEXEC, and under parallel load that forked child sometimes
 * dies (rc 139, #2996). `writeStubExecutable` always puts a shebang on the
 * first line. `stubExecutableGuard.test.ts` fails any other test that sets
 * an executable mode by hand.
 */
import { chmodSync, writeFileSync } from 'node:fs'

/**
 * Write `body` to `path` as an executable that starts with a shebang.
 *
 * - A body with no `#!` first line gets `shebang` (default `#!/bin/sh`) put
 *   in front. Pass `#!/usr/bin/env bash` when the body needs bash features.
 * - A body that already starts with `#!` is written as-is. If `shebang` is
 *   also given and differs from it, that is a mistake and this throws.
 */
export function writeStubExecutable(
  path: string,
  body: string,
  shebang?: string
): void {
  let text: string
  if (body.startsWith('#!')) {
    const first = body.split('\n', 1)[0]
    if (shebang !== undefined && shebang !== first) {
      throw new Error(
        `stub body starts with "${first}" but the shebang argument is "${shebang}"`
      )
    }
    text = body
  } else {
    const line = shebang ?? '#!/bin/sh'
    if (!line.startsWith('#!')) {
      throw new Error(`shebang must start with "#!", got "${line}"`)
    }
    text = `${line}\n${body}`
  }
  writeFileSync(path, text, { mode: 0o755 })
  // writeFileSync's mode is masked by umask and ignored for an existing file.
  chmodSync(path, 0o755)
}

/** Make an existing script (one that already has its own shebang) executable. */
export function makeExecutable(path: string): void {
  chmodSync(path, 0o755)
}
