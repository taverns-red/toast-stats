---
id: '168'
category: lesson
tags: [collector-cli, typescript, tdd, verification, node]
auto_load: true
date: 2026-06-13
issues: [1182, 1193]
---

# Lesson 168 — A `: never`-typed _deferred_ exit narrows types but does NOT halt runtime; inside a `catch` you must `return` it

**Date:** 2026-06-13
**Issue:** #1182 (epic #1193 Sprint 3 — stdout flush-before-exit)
**PR:** _(record on merge)_

## What happened

`process.exit()` truncates a large stdout summary at the ~64KB highWaterMark
when stdout is a pipe (it discards bytes still buffered for the async pipe;
file/TTY are unaffected). The fix replaced the terminal
`console.log(JSON.stringify(...)); process.exit(code)` pattern with a helper
that writes then exits from the write's **drain callback**:

```ts
export function emitJsonAndExit(payload: unknown, exitCode: number): never {
  process.stdout.once('error', () => process.exit(exitCode)) // EPIPE: don't hang
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n', () =>
    process.exit(exitCode)
  )
  return undefined as never
}
```

The helper is typed `: never`, so TypeScript treats every call as terminating
control flow — code after it is "unreachable", and a variable assigned in a
`try` narrows to defined past the `catch`. That made the build pass. But the
helper **returns synchronously** (the real exit is deferred to the next tick).
At a `catch` that had live code after the `try/catch`, control fell straight
through to `const { report, decision } = result` with `result` still
`undefined` (the `try` had thrown) — a `TypeError` on the same tick, _before_
the deferred exit fired, surfacing the wrong exit code. The original
synchronous `process.exit()` could never do this. A fresh-context review
caught it; the unit tests and typecheck did not (the type says `never`, so
nothing flagged the fall-through).

The fix at that one site: `return emitJsonAndExit(...)`. The `return` both
terminates the handler at runtime AND gives the same CFA narrowing — so the
`never` type isn't even load-bearing there.

Two more traps from the same change:

- **`never`-narrowing doesn't survive a destructured alias.** `const { fn } =
helpers` loses the "this call is unreachable-after" assertion that
  `helpers.fn()` (namespace access) or a `return` keeps. (Empirically
  confirmed with a canary; modern TS, this repo's config.)
- **A deferred exit can hang on EPIPE.** A closed reader (`| head`) makes
  stdout emit `'error'`; the drain callback isn't guaranteed to fire, so the
  process hangs instead of exiting. Guard with `stdout.once('error', exit)`.

## The transferable principle

**Replacing a synchronous, OS-level terminator (`process.exit`) with a helper
that _defers_ termination is a control-flow change, not just a refactor — even
when the helper is typed `: never`. The type only governs the compiler's
reachability analysis; at runtime the function returns and the next statement
runs on the same tick. Make it the genuine last action of every code path that
calls it: trivially at the end of a block, explicitly with `return` inside a
`catch` or any block with code after it. And only defer where deferral is safe
— fail-fast paths that must stop the world (option validators, fail-closed
guards) stay on synchronous `process.exit()`.**

## How to apply

- Auditing a sync→deferred exit swap: for each call site ask "is there code
  after this on the same tick?" If yes, it must be `return`ed (or the exit
  kept synchronous). The typechecker will not ask this for you.
- Keep the sync/deferred split principled and documented: defer only the
  large-stdout terminal emits; keep small-stderr fail-fast exits synchronous.
- A deferred exit needs an `'error'`/EPIPE escape hatch so a closed pipe can't
  hang it — the synchronous version it replaced never could.
- This is exactly the class of bug fresh-context review exists to catch:
  "obvious to the author, invisible to the type system." Don't skip it because
  the diff looks mechanical.

## Related

- [[158-a-fail-closed-chain-is-only-as-honest-as-its-writers-a-persisted-default-reads-as-a-decision]]
  — same package's fail-closed exit discipline (R4 stdout/stderr split).
- `tasks/rules.md` R4 (stdout = structured JSON only; logs to stderr) — the
  invariant the flush helper preserves byte-for-byte.
