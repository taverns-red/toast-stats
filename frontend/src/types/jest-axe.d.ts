declare module 'jest-axe' {
  /**
   * `axe(container, options)` — the second parameter is axe-core's run
   * options, which call sites use to scope a scan to specific rules
   * (`{ runOnly: { type: 'rule', values: ['aria-allowed-attr'] } }`, #1360).
   *
   * It was declared with a single parameter until #1389. The test tree was
   * excluded from tsc, so the arity was never checked against a real call —
   * the same blind spot that hid the `toHaveNoViolations` shape below.
   */
  export function axe(
    element: Element | Document,
    options?: Record<string, unknown>
  ): Promise<unknown>

  /**
   * jest-axe's export is a matchers OBJECT — `{ toHaveNoViolations }` — which
   * is why every call site reads `expect.extend(toHaveNoViolations)` rather
   * than `expect.extend({ toHaveNoViolations })`.
   *
   * This was declared as a bare function until #1368. Passing a function where
   * `expect.extend` wants a matchers record is a type error at all six call
   * sites, but the test tree was excluded from tsc, so nobody ever saw it.
   */
  export const toHaveNoViolations: {
    toHaveNoViolations(received: unknown): { message(): string; pass: boolean }
  }
}

declare global {
  namespace Vi {
    interface Assertion<T = unknown> {
      toHaveNoViolations(): T
    }
  }

  namespace Vitest {
    interface Assertion<T = unknown> {
      toHaveNoViolations(): T
    }
  }
}
