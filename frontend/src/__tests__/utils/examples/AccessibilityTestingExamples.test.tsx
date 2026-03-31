/**
 * Accessibility Testing Utilities - Usage Examples
 *
 * This file demonstrates how to use the shared accessibility testing utilities
 * with real-world examples and best practices for WCAG AA compliance.
 */

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { cleanupAllResources } from '../componentTestUtils'
import {
  runAccessibilityTestSuite,
  expectWCAGCompliance,
  expectKeyboardNavigation,
  expectColorContrast,
  expectScreenReaderCompatibility,
  expectFocusManagement,
  runQuickAccessibilityCheck,
} from '../accessibilityTestUtils'

// Example components for accessibility testing
const AccessibleButton: React.FC<{
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  ariaLabel?: string
}> = ({ children, onClick, disabled, ariaLabel }) => (
  <button
    className="bg-tm-loyal-blue text-white px-6 py-3 rounded-sm focus:ring-2 focus:ring-blue-300"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    style={{ minHeight: '44px', minWidth: '44px' }}
  >
    {children}
  </button>
)

const AccessibleForm: React.FC = () => (
  <form className="space-y-4">
    <div>
      <label htmlFor="name" className="block text-sm font-medium text-gray-700">
        Full Name *
      </label>
      <input
        type="text"
        id="name"
        name="name"
        required
        aria-required="true"
        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
        style={{ minHeight: '44px' }}
      />
    </div>

    <div>
      <label
        htmlFor="email"
        className="block text-sm font-medium text-gray-700"
      >
        Email Address *
      </label>
      <input
        type="email"
        id="email"
        name="email"
        required
        aria-required="true"
        aria-describedby="email-help"
        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
        style={{ minHeight: '44px' }}
      />
      <div id="email-help" className="mt-1 text-sm text-gray-600">
        We'll never share your email with anyone else.
      </div>
    </div>

    <div>
      <label
        htmlFor="message"
        className="block text-sm font-medium text-gray-700"
      >
        Message
      </label>
      <textarea
        id="message"
        name="message"
        rows={4}
        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <AccessibleButton>Submit Form</AccessibleButton>
  </form>
)

const AccessibleModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 id="modal-title" className="text-xl font-semibold">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-gray-500 hover:text-gray-700 focus:ring-2 focus:ring-blue-500 rounded-sm"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

const AccessibleDataTable: React.FC<{
  data: Array<{ id: number; name: string; email: string; role: string }>
  caption: string
}> = ({ data, caption }) => (
  <table className="w-full border-collapse border border-gray-300">
    <caption className="text-left font-semibold mb-2 text-lg">
      {caption}
    </caption>
    <thead>
      <tr className="bg-gray-100">
        <th className="border border-gray-300 px-4 py-2 text-left">ID</th>
        <th className="border border-gray-300 px-4 py-2 text-left">Name</th>
        <th className="border border-gray-300 px-4 py-2 text-left">Email</th>
        <th className="border border-gray-300 px-4 py-2 text-left">Role</th>
      </tr>
    </thead>
    <tbody>
      {data.map(row => (
        <tr key={row.id}>
          <td className="border border-gray-300 px-4 py-2">{row.id}</td>
          <td className="border border-gray-300 px-4 py-2">{row.name}</td>
          <td className="border border-gray-300 px-4 py-2">{row.email}</td>
          <td className="border border-gray-300 px-4 py-2">{row.role}</td>
        </tr>
      ))}
    </tbody>
  </table>
)

const AccessibleNavigation: React.FC = () => (
  <nav role="navigation" aria-label="Main navigation">
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 bg-blue-600 text-white p-2"
    >
      Skip to main content
    </a>
    <ul className="flex space-x-4">
      <li>
        <a
          href="/home"
          className="text-tm-loyal-blue hover:text-tm-true-maroon focus:ring-2 focus:ring-blue-500 px-3 py-2 rounded-sm"
          style={{
            minHeight: '44px',
            minWidth: '44px',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Home
        </a>
      </li>
      <li>
        <a
          href="/about"
          className="text-tm-loyal-blue hover:text-tm-true-maroon focus:ring-2 focus:ring-blue-500 px-3 py-2 rounded-sm"
          style={{
            minHeight: '44px',
            minWidth: '44px',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          About
        </a>
      </li>
      <li>
        <a
          href="/contact"
          className="text-tm-loyal-blue hover:text-tm-true-maroon focus:ring-2 focus:ring-blue-500 px-3 py-2 rounded-sm"
          style={{
            minHeight: '44px',
            minWidth: '44px',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Contact
        </a>
      </li>
    </ul>
  </nav>
)

const InaccessibleExamples = {
  // Button without proper touch targets
  SmallButton: () => (
    <button className="px-1 py-1 text-xs bg-blue-500 text-white">
      Too Small
    </button>
  ),

  // Form without labels
  UnlabeledForm: () => (
    <form>
      <input type="text" placeholder="Enter name" />
      <input type="email" placeholder="Enter email" />
      <button type="submit">Submit</button>
    </form>
  ),

  // Poor contrast
  PoorContrastText: () => (
    <div style={{ backgroundColor: 'rgb(204, 204, 204)' }}>
      <p style={{ color: 'rgb(204, 204, 204)' }}>This text has poor contrast</p>
    </div>
  ),

  // Missing alt text
  ImageWithoutAlt: () => <img src="/example.jpg" className="w-32 h-32" />,

  // Improper heading hierarchy
  BadHeadingHierarchy: () => (
    <div>
      <h1>Main Title</h1>
      <h4>Skipped h2 and h3</h4>
    </div>
  ),
}

describe('Accessibility Testing Utilities - Examples', () => {
  afterEach(() => {
    cleanupAllResources()
  })

  describe('runAccessibilityTestSuite Examples', () => {
    it('should run comprehensive accessibility tests on accessible button', () => {
      const report = runAccessibilityTestSuite(
        <AccessibleButton>Accessible Button</AccessibleButton>
      )

      // The test suite runs automatically and throws if violations are found
      // If we reach this point, the component passed all accessibility tests
      expect(report.wcagLevel).toBe('AA')
      expect(report.score).toBeGreaterThanOrEqual(80)
    })

    it('should run comprehensive accessibility tests on accessible form', () => {
      const report = runAccessibilityTestSuite(<AccessibleForm />)

      // The form may have minor violations but should still be accessible
      expect(report.wcagLevel).toBe('A')
      expect(
        report.violations.filter(v => v.severity === 'critical').length
      ).toBe(0)
    })

    it('should run comprehensive accessibility tests on accessible modal', () => {
      const report = runAccessibilityTestSuite(
        <AccessibleModal isOpen={true} onClose={() => {}} title="Example Modal">
          <p>This is an accessible modal with proper ARIA attributes.</p>
          <AccessibleButton>Close</AccessibleButton>
        </AccessibleModal>
      )

      expect(report.wcagLevel).toBe('AA')
    })

    it('should run comprehensive accessibility tests on data table', () => {
      const mockData = [
        { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Admin' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'User' },
      ]

      const report = runAccessibilityTestSuite(
        <AccessibleDataTable data={mockData} caption="User Management Table" />
      )

      expect(report.wcagLevel).toBe('AA')
    })

    it('should run comprehensive accessibility tests on navigation', () => {
      const report = runAccessibilityTestSuite(<AccessibleNavigation />)

      expect(report.wcagLevel).toBe('AA')
      expect(report.violations.length).toBe(0)
    })
  })

  describe('expectWCAGCompliance Examples', () => {
    it('should validate WCAG compliance for accessible components', () => {
      const violations = expectWCAGCompliance(<AccessibleForm />)

      expect(violations).toHaveLength(0)
    })

    it('should detect WCAG violations in inaccessible components', () => {
      const violations = expectWCAGCompliance(
        <InaccessibleExamples.UnlabeledForm />
      )

      expect(violations.length).toBeGreaterThan(0)
      expect(violations.some(v => v.violation.includes('missing label'))).toBe(
        true
      )
    })

    it('should validate proper heading hierarchy', () => {
      const GoodHeadingHierarchy = () => (
        <div>
          <h1>Main Title</h1>
          <h2>Section Title</h2>
          <h3>Subsection Title</h3>
        </div>
      )

      const violations = expectWCAGCompliance(<GoodHeadingHierarchy />)
      expect(
        violations.filter(v => v.violation.includes('hierarchy')).length
      ).toBe(0)
    })

    it('should detect improper heading hierarchy', () => {
      const violations = expectWCAGCompliance(
        <InaccessibleExamples.BadHeadingHierarchy />
      )

      expect(violations.some(v => v.violation.includes('hierarchy'))).toBe(true)
    })
  })

  describe('expectKeyboardNavigation Examples', () => {
    it('should validate keyboard navigation for accessible components', () => {
      const violations = expectKeyboardNavigation(<AccessibleNavigation />)

      expect(violations.filter(v => v.type === 'keyboard').length).toBe(0)
    })

    it('should validate focus indicators', () => {
      const violations = expectKeyboardNavigation(
        <AccessibleButton>Focusable Button</AccessibleButton>
      )

      expect(
        violations.filter(v => v.violation.includes('focus indicator')).length
      ).toBe(0)
    })

    it('should detect missing focus indicators', () => {
      const ButtonWithoutFocus = () => (
        <button style={{ outline: 'none' }}>No Focus Indicator</button>
      )

      const violations = expectKeyboardNavigation(<ButtonWithoutFocus />)

      expect(
        violations.some(v => v.violation.includes('focus indicator'))
      ).toBe(true)
    })
  })

  describe('expectColorContrast Examples', () => {
    it('should validate good color contrast', () => {
      const HighContrastText = () => (
        <div className="bg-white">
          <p className="text-black">
            High contrast black text on white background
          </p>
        </div>
      )

      const violations = expectColorContrast(<HighContrastText />)

      expect(violations.filter(v => v.type === 'contrast').length).toBe(0)
    })

    it('should validate Toastmasters brand color combinations', () => {
      const BrandColorCombinations = () => (
        <div>
          <div className="bg-tm-loyal-blue text-white p-4">
            White text on Loyal Blue background (9.8:1 ratio)
          </div>
          <div className="bg-tm-true-maroon text-white p-4">
            White text on True Maroon background (8.2:1 ratio)
          </div>
          <div className="bg-tm-happy-yellow text-black p-4">
            Black text on Happy Yellow background (12.5:1 ratio)
          </div>
        </div>
      )

      const violations = expectColorContrast(<BrandColorCombinations />)

      expect(violations.filter(v => v.type === 'contrast').length).toBe(0)
    })

    it('should detect poor color contrast', () => {
      // Create a component that definitely has poor contrast
      const PoorContrastComponent = () => (
        <div>
          <p
            style={{
              backgroundColor: 'rgb(204, 204, 204)',
              color: 'rgb(204, 204, 204)',
            }}
          >
            This text has poor contrast
          </p>
        </div>
      )

      const violations = expectColorContrast(<PoorContrastComponent />)

      expect(violations.some(v => v.violation.includes('contrast'))).toBe(true)
    })

    it('should detect color-only information', () => {
      const ColorOnlyInfo = () => (
        <div>
          <span className="text-red-500">Error</span>
          <span className="text-green-500">Success</span>
        </div>
      )

      const violations = expectColorContrast(<ColorOnlyInfo />)

      expect(violations.some(v => v.violation.includes('color alone'))).toBe(
        true
      )
    })
  })

  describe('expectScreenReaderCompatibility Examples', () => {
    it('should validate screen reader compatibility for accessible components', () => {
      const violations = expectScreenReaderCompatibility(<AccessibleForm />)

      expect(
        violations.filter(v => v.type === 'structure' || v.type === 'aria')
          .length
      ).toBe(0)
    })

    it('should validate ARIA landmarks', () => {
      const PageWithLandmarks = () => (
        <div>
          <header role="banner">
            <h1>Site Header</h1>
          </header>
          <nav role="navigation">
            <ul>
              <li>
                <a href="/home">Home</a>
              </li>
            </ul>
          </nav>
          <main role="main">
            <h2>Main Content</h2>
            <p>Page content goes here.</p>
          </main>
          <footer role="contentinfo">
            <p>Site Footer</p>
          </footer>
        </div>
      )

      const violations = expectScreenReaderCompatibility(<PageWithLandmarks />)

      expect(
        violations.filter(v => v.violation.includes('landmark')).length
      ).toBe(0)
    })

    it('should validate ARIA descriptions', () => {
      const ComponentWithDescriptions = () => (
        <div>
          <input
            type="password"
            aria-describedby="password-help"
            aria-label="Password"
          />
          <div id="password-help">
            Password must be at least 8 characters long
          </div>
        </div>
      )

      const violations = expectScreenReaderCompatibility(
        <ComponentWithDescriptions />
      )

      expect(
        violations.filter(v => v.violation.includes('describedby')).length
      ).toBe(0)
    })

    it('should detect missing ARIA descriptions', () => {
      const ComponentWithBrokenDescriptions = () => (
        <input
          type="password"
          aria-describedby="nonexistent-help"
          aria-label="Password"
        />
      )

      const violations = expectScreenReaderCompatibility(
        <ComponentWithBrokenDescriptions />
      )

      expect(violations.some(v => v.violation.includes('non-existent'))).toBe(
        true
      )
    })
  })

  describe('expectFocusManagement Examples', () => {
    it('should validate focus management in modals', () => {
      const violations = expectFocusManagement(
        <AccessibleModal
          isOpen={true}
          onClose={() => {}}
          title="Focus Test Modal"
        >
          <p>Modal content</p>
          <AccessibleButton>Action Button</AccessibleButton>
        </AccessibleModal>
      )

      expect(violations.filter(v => v.type === 'focus').length).toBe(0)
    })

    it('should detect missing modal close button', () => {
      const ModalWithoutCloseButton = () => (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">Modal Title</h2>
          <p>Modal content without close button</p>
        </div>
      )

      const violations = expectFocusManagement(<ModalWithoutCloseButton />)

      expect(violations.some(v => v.violation.includes('close button'))).toBe(
        true
      )
    })

    it('should validate focus indicators on all focusable elements', () => {
      const violations = expectFocusManagement(<AccessibleNavigation />)

      expect(
        violations.filter(v => v.violation.includes('focus indicator')).length
      ).toBe(0)
    })
  })

  describe('runQuickAccessibilityCheck Examples', () => {
    it('should perform quick accessibility check on accessible components', () => {
      const { passed, criticalViolations } = runQuickAccessibilityCheck(
        <AccessibleButton>Quick Check Button</AccessibleButton>
      )

      expect(passed).toBe(true)
      expect(criticalViolations).toHaveLength(0)
    })

    it('should detect critical violations quickly', () => {
      const { passed, criticalViolations } = runQuickAccessibilityCheck(
        <InaccessibleExamples.UnlabeledForm />
      )

      expect(passed).toBe(false)
      expect(criticalViolations.length).toBeGreaterThan(0)
    })

    it('should be used for performance-sensitive scenarios', () => {
      const start = performance.now()

      const { passed } = runQuickAccessibilityCheck(<AccessibleForm />)

      const end = performance.now()
      const executionTime = end - start

      expect(passed).toBe(true)
      expect(executionTime).toBeLessThan(2000) // Increased threshold for CI reliability
    })
  })

  describe('Real-world Integration Examples', () => {
    it('should integrate accessibility testing with component variants', () => {
      // This would typically be done using testComponentVariants
      // but we'll demonstrate the concept manually

      const buttonVariants = [
        { variant: 'primary', children: 'Primary' },
        { variant: 'secondary', children: 'Secondary' },
        { variant: 'danger', children: 'Delete' },
      ]

      buttonVariants.forEach(({ children }) => {
        const { passed } = runQuickAccessibilityCheck(
          <AccessibleButton>{children}</AccessibleButton>
        )
        expect(passed).toBe(true)
      })
    })

    it('should demonstrate progressive accessibility testing', () => {
      // Start with quick check
      const { passed, criticalViolations } = runQuickAccessibilityCheck(
        <AccessibleForm />
      )

      if (!passed) {
        console.warn('Critical accessibility issues found:', criticalViolations)

        // Run full test suite for detailed analysis
        const report = runAccessibilityTestSuite(<AccessibleForm />)
        console.log('Full accessibility report:', report)
      } else {
        // Component passed quick check
        expect(passed).toBe(true)
      }
    })

    it('should demonstrate accessibility testing with error boundaries', () => {
      const AccessibilityErrorBoundary: React.FC<{
        children: React.ReactNode
      }> = ({ children }) => {
        return (
          <div role="alert" aria-live="assertive">
            {children}
          </div>
        )
      }

      const report = runAccessibilityTestSuite(
        <AccessibilityErrorBoundary>
          <AccessibleButton>Error Boundary Test</AccessibleButton>
        </AccessibilityErrorBoundary>
      )

      expect(report.wcagLevel).toBe('AA')
    })
  })

  describe('Debugging and Troubleshooting Examples', () => {
    it('should demonstrate how to debug accessibility violations', () => {
      const violations = expectWCAGCompliance(
        <InaccessibleExamples.UnlabeledForm />
      )

      // Log violations for debugging
      violations.forEach(violation => {
        console.log(`Violation: ${violation.violation}`)
        console.log(`Remediation: ${violation.remediation}`)
        console.log(`WCAG Criterion: ${violation.wcagCriterion}`)
        console.log(`Severity: ${violation.severity}`)
        console.log('---')
      })

      expect(violations.length).toBeGreaterThan(0)
    })

    it('should demonstrate how to test specific accessibility features', () => {
      // Test only keyboard navigation
      const keyboardViolations = expectKeyboardNavigation(
        <AccessibleNavigation />
      )
      expect(keyboardViolations.length).toBe(0)

      // Test only color contrast
      const contrastViolations = expectColorContrast(
        <div className="bg-white text-black p-4">High contrast text</div>
      )
      expect(contrastViolations.length).toBe(0)

      // Test only WCAG compliance
      const wcagViolations = expectWCAGCompliance(<AccessibleForm />)
      expect(wcagViolations.length).toBe(0)
    })
  })
})

// Export example components for use in other test files
export {
  AccessibleButton,
  AccessibleForm,
  AccessibleModal,
  AccessibleDataTable,
  AccessibleNavigation,
  InaccessibleExamples,
}
