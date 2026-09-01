/**
 * Regression tests for the shared accessibility testing utilities.
 *
 * These guard the *utilities themselves*, not the components under test —
 * a test helper that reports violations a component does not have is worse
 * than no helper at all.
 */

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { cleanupAllResources } from './componentTestUtils'
import {
  runAccessibilityTestSuite,
  expectScreenReaderCompatibility,
} from './accessibilityTestUtils'

/**
 * A component whose `aria-describedby` target unambiguously exists, inside the
 * same subtree. Any "references non-existent element" violation reported for
 * this component is a false positive by construction.
 */
const DescribedInput: React.FC = () => (
  <div>
    <label htmlFor="email">Email Address</label>
    <input
      type="email"
      id="email"
      aria-required="true"
      aria-describedby="email-help"
      style={{ minHeight: '44px' }}
      className="focus:ring-2"
    />
    <div id="email-help">We&apos;ll never share your email.</div>
  </div>
)

describe('accessibilityTestUtils', () => {
  afterEach(() => {
    cleanupAllResources()
  })

  describe('render isolation between checks (#1503)', () => {
    it('does not report a false aria-describedby violation for an existing target', () => {
      const report = runAccessibilityTestSuite(<DescribedInput />)

      const describedByViolations = report.violations.filter(v =>
        v.violation.includes('aria-describedby references non-existent element')
      )

      expect(describedByViolations).toEqual([])
    })

    it('agrees with a single-check run, which cannot suffer duplicate ids', () => {
      // `expectScreenReaderCompatibility` renders exactly once, so it is the
      // control: whatever it reports is what the full suite must report too.
      const control = expectScreenReaderCompatibility(<DescribedInput />)
      cleanupAllResources()

      const report = runAccessibilityTestSuite(<DescribedInput />)

      expect(report.violations.map(v => v.violation)).toEqual(
        control.map(v => v.violation)
      )
    })

    it('leaves no rendered copies behind once the suite has run', () => {
      // Five helpers each render the component. If none of them unmount, the
      // document ends up holding five copies of every id.
      runAccessibilityTestSuite(<DescribedInput />)

      expect(document.querySelectorAll('#email-help')).toHaveLength(0)
    })
  })
})
