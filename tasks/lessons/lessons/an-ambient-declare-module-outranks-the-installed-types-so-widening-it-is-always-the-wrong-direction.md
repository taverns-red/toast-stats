---
date: 2026-08-03
tier: lesson
summary: An ambient `declare module 'x'` in your own source outranks `@types/x` in node_modules, so a shim that keeps needing to be widened is a shim that should be deleted — each widening hand-copies a declaration already installed, and converges on it without ever arriving
tags: [typescript, types, test-infra, jest-axe, vitest, tsconfig, dependencies]
---

# An ambient `declare module` outranks the installed types, so widening it is always the wrong direction

**Date:** 2026-08-03
**Issue:** #1393 (test-infra: delete the hand-rolled jest-axe shim)
**Tags:** typescript, types, test-infra, jest-axe, vitest, tsconfig, dependencies

## What happened

`frontend/src/types/jest-axe.d.ts` was a hand-rolled `declare module 'jest-axe'`.
`@types/jest-axe@3.5.9` was, the whole time, sitting in `frontend/package.json`
as a devDependency and in `node_modules`. A global `declare module` **wins** the
resolution — so the installed types were never once loaded, and the shim's word
was final on every question anyone asked about `jest-axe`.

It was wrong twice, and each time it was *widened* rather than removed:

- **#1368** — `toHaveNoViolations` declared as a bare function when it is a
  matchers **object**. Eight `@ts-expect-error` directives existed only to
  suppress the fallout (all inert; the test tree was excluded from `tsc`).
- **#1389** — `axe` declared with a **single** parameter, so
  `axe(container, { runOnly: … })` was a TS2554 arity error and **`main` went
  red**.

Both fixes edited the shim to say what `@types/jest-axe` already said. Deleting
the file outright — no replacement, not one line kept — leaves
`npm run typecheck:tests` at **0 errors** and all 14 axe-importing test files
green.

## The transferable takeaway

**A local shim that keeps needing to be widened is not an incomplete shim; it is
a shim that is shadowing something.** Widening converges asymptotically on a
declaration you already have installed, and never arrives, because nothing in
the loop ever compares the two. The tell is the repeat: a *second* "the shim was
missing a parameter / a property / an overload" fix is the signal to go look in
`node_modules`, not to add the parameter.

Ambient declarations are the highest-precedence answer TypeScript has. That
makes them useful for genuinely untyped packages and dangerous everywhere else —
they fail **silently and permanently**, with no "duplicate declaration" warning
to tell you a real `@types/*` package is being ignored.

## The second half: "our runner is different" was also unchecked

The shim also carried `Vi.Assertion` / `Vitest.Assertion` global augmentations
for `toHaveNoViolations`, on the reasonable-sounding premise that *jest-axe
ships **jest** matcher types and this project runs **vitest***. That premise was
never tested either. `@vitest/expect` declares:

```ts
interface JestAssertion<T = any> extends jest.Matchers<void, T>, CustomMatcher {
```

— vitest's `Assertion` **extends the `jest.Matchers` namespace**, which is
exactly what `@types/jest-axe` augments. The bridge already existed. Both halves
of the shim were re-implementations of things in `node_modules`.

## What to do instead

- **Before writing or widening any `declare module 'x'`, run `ls
  node_modules/@types/x` and check `x/package.json` for a `types` field.** Two
  commands. This file cost three incidents and one red `main`.
- If a shim must exist, **scope it to the delta** — augment (`declare module 'x'
  { interface Foo { … } }` on an already-typed module) rather than declaring the
  whole module, so the real types stay in force and a version bump can surface
  the conflict.
- **Falsify that the real types are live**, don't infer it from a green build: a
  green build is exactly what a shadowing shim produces. Write a deliberately
  wrong call and read *which* type the error names. Here, deleting the shim made
  `axe(container, 42)` report

  ```
  error TS2559: Type '42' has no properties in common with type 'RunOptions'.
  ```

  `RunOptions` is **axe-core's**, reachable only through `@types/jest-axe` — the
  error text itself is the proof. A local redeclaration could never have named
  it.
- Note the side effect and accept it deliberately: `@types/jest-axe` opens with
  `/// <reference types="jest" />`, so loading it pulls `@types/jest` into a
  compilation whose `types` array lists only `vitest/globals`. Here vitest still
  wins `expect` (the probe error names `Assertion<AxeResults>`, vitest's type,
  not jest's `Matchers`) — but check, don't assume, when un-shadowing a
  `@types/*` package that references another test framework.

## Related

- `a-suppression-directive-in-an-unchecked-file-is-a-false-safety-signal.md`
  (#1368) — the eight inert `@ts-expect-error`s over `expect.extend(...)` were
  this shim's fallout. That lesson closed the *detection* gap by adding
  `typecheck:test`; this one removes the *cause*. Without #1368's gate, none of
  the verification above would have been possible.
- `when-removing-a-bandaid-grep-for-its-shape-not-just-its-named-site.md` — same
  family: the workaround outlives the condition, and the cheap check is looking
  for what it was working around.
