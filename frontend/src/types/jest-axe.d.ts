declare module 'jest-axe' {
  export function axe(element: Element | Document): Promise<unknown>

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
