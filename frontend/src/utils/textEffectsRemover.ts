/**
 * Text Effects Remover Utility
 *
 * Scans for and removes prohibited text effects according to Requirements 2.3, 2.4
 * Prohibited effects: drop-shadow, outline, glow, text-shadow, text-stroke
 */

export interface TextEffectViolation {
  element: HTMLElement
  property: string
  value: string
  selector: string
}

export interface TextEffectScanResult {
  violations: TextEffectViolation[]
  totalElements: number
  violationsRemoved: number
  errors: string[]
}

// Prohibited text effect properties
export const PROHIBITED_TEXT_EFFECTS = [
  'text-shadow',
  'filter',
  '-webkit-text-stroke',
  'text-stroke',
  'text-outline',
  '-webkit-text-outline',
] as const

// Prohibited filter values that create text effects
export const PROHIBITED_FILTER_VALUES = [
  'drop-shadow',
  'glow',
  'blur',
  'brightness',
  'contrast',
  'hue-rotate',
  'saturate',
  'sepia',
] as const

/**
 * Scan an element for prohibited text effects
 */
export function scanElementForTextEffects(
  element: HTMLElement
): TextEffectViolation[] {
  const violations: TextEffectViolation[] = []
  const computedStyle = window.getComputedStyle(element)

  // Check each prohibited property
  PROHIBITED_TEXT_EFFECTS.forEach(property => {
    const value = computedStyle.getPropertyValue(property)

    if (
      value &&
      value !== 'none' &&
      value !== 'initial' &&
      value !== 'unset' &&
      value !== 'inherit' &&
      value !== ''
    ) {
      // Special handling for filter property
      if (property === 'filter') {
        const hasProhibitedFilter = PROHIBITED_FILTER_VALUES.some(
          prohibitedValue => value.toLowerCase().includes(prohibitedValue)
        )

        if (hasProhibitedFilter) {
          violations.push({
            element,
            property,
            value,
            selector: getElementSelector(element),
          })
        }
      } else {
        violations.push({
          element,
          property,
          value,
          selector: getElementSelector(element),
        })
      }
    }
  })

  return violations
}

/**
 * Scan entire page for prohibited text effects
 */
export function scanPageForTextEffects(): TextEffectScanResult {
  const allElements = document.querySelectorAll('*')
  const violations: TextEffectViolation[] = []
  const errors: string[] = []

  allElements.forEach((element, index) => {
    try {
      const elementViolations = scanElementForTextEffects(
        element as HTMLElement
      )
      violations.push(...elementViolations)
    } catch (error) {
      errors.push(
        `Element ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  })

  return {
    violations,
    totalElements: allElements.length,
    violationsRemoved: 0,
    errors,
  }
}

/**
 * Remove prohibited text effects from an element
 */
export function removeTextEffectsFromElement(element: HTMLElement): boolean {
  try {
    // Remove prohibited text effects by setting them to 'none'
    PROHIBITED_TEXT_EFFECTS.forEach(property => {
      element.style.setProperty(property, 'none', 'important')
    })

    return true
  } catch (error) {
    console.warn('Failed to remove text effects from element:', error)
    return false
  }
}

/**
 * Remove prohibited text effects from entire page
 */
export function removeTextEffectsFromPage(): TextEffectScanResult {
  const scanResult = scanPageForTextEffects()
  let violationsRemoved = 0
  const errors: string[] = [...scanResult.errors]

  scanResult.violations.forEach(violation => {
    try {
      const success = removeTextEffectsFromElement(violation.element)
      if (success) {
        violationsRemoved++
      }
    } catch (error) {
      errors.push(
        `Failed to remove effect from ${violation.selector}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  })

  return {
    violations: scanResult.violations,
    totalElements: scanResult.totalElements,
    violationsRemoved,
    errors,
  }
}

/**
 * Generate CSS rules to prevent prohibited text effects
 */
export function generateTextEffectPreventionCSS(): string {
  const prohibitedProperties = PROHIBITED_TEXT_EFFECTS.map(
    property => `  ${property}: none !important;`
  ).join('\n')

  return `
/* Text Effects Prevention - Auto-generated */
/* Prevents prohibited text effects according to Toastmasters brand guidelines */

/* Apply to all elements to prevent prohibited effects */
* {
${prohibitedProperties}
}

/* Specific prevention for text elements */
h1, h2, h3, h4, h5, h6,
p, span, div, label, input, textarea, select, button,
td, th, a, nav {
${prohibitedProperties}
}

/* Ensure no glow effects through box-shadow */
* {
  box-shadow: none !important;
}

/* Allow only approved box-shadow for focus states */
:focus-visible {
  box-shadow: 0 0 0 2px var(--tm-loyal-blue) !important;
}

/* Allow only approved box-shadow for cards */
.tm-card {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
}
`
}

/**
 * Inject text effect prevention CSS into the page
 */
export function injectTextEffectPreventionCSS(): void {
  const existingStyle = document.getElementById('text-effects-prevention')
  if (existingStyle) {
    existingStyle.remove()
  }

  const style = document.createElement('style')
  style.id = 'text-effects-prevention'
  style.textContent = generateTextEffectPreventionCSS()
  document.head.appendChild(style)
}

/**
 * Optimize font loading by adding font-display: swap to existing font faces
 */
export function optimizeFontLoading(): void {
  // Check if fonts are already loaded
  if (document.documentElement.classList.contains('fonts-loaded')) {
    return
  }

  // Add font loading optimization class
  document.documentElement.classList.add('fonts-loading')

  // Wait for fonts to load
  if ('fonts' in document) {
    document.fonts.ready.then(() => {
      document.documentElement.classList.remove('fonts-loading')
      document.documentElement.classList.add('fonts-loaded')
    })
  } else {
    // Fallback for browsers without Font Loading API
    setTimeout(() => {
      document.documentElement.classList.remove('fonts-loading')
      document.documentElement.classList.add('fonts-loaded')
    }, 3000) // 3 second timeout
  }
}

/**
 * Preload critical font files for better performance
 */
export function preloadCriticalFonts(): void {
  // Font preloading is handled by <link rel="preload"> in index.html.
  // Hardcoded woff2 subset URLs are not used here because Google Fonts
  // updates them when font versions change, causing stale 404s.
}

/**
 * Complete font loading optimization setup
 */
export function setupFontLoadingOptimization(): void {
  // Preload critical fonts
  preloadCriticalFonts()

  // Optimize font loading
  optimizeFontLoading()

  // Add font loading states to CSS
  const style = document.createElement('style')
  style.textContent = `
    /* Font Loading States */
    .fonts-loading {
      visibility: hidden;
    }
    
    .fonts-loaded {
      visibility: visible;
    }
    
    /* Fallback typography for slow connections */
    body:not(.fonts-loaded) {
      font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    }
  `
  document.head.appendChild(style)
}

// Helper functions

/**
 * Get a CSS selector for an element (for debugging/reporting)
 */
function getElementSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${element.id}`
  }

  if (element.className) {
    const classes = Array.from(element.classList).slice(0, 2).join('.')
    return `.${classes}`
  }

  return element.tagName.toLowerCase()
}

/**
 * Generate a comprehensive report of text effects violations
 */
export function generateTextEffectsReport(): string {
  const scanResult = scanPageForTextEffects()

  let report = `# Text Effects Compliance Report\n\n`
  report += `**Generated:** ${new Date().toISOString()}\n`
  report += `**Total Elements Scanned:** ${scanResult.totalElements}\n`
  report += `**Violations Found:** ${scanResult.violations.length}\n\n`

  if (scanResult.violations.length > 0) {
    report += `## Violations\n\n`
    scanResult.violations.forEach((violation, index) => {
      report += `### Violation ${index + 1}\n`
      report += `- **Element:** ${violation.selector}\n`
      report += `- **Property:** ${violation.property}\n`
      report += `- **Value:** ${violation.value}\n`
      report += `- **Recommendation:** Remove prohibited text effect\n\n`
    })
  } else {
    report += `## ✅ No Violations Found\n\n`
    report += `All elements comply with Toastmasters brand guidelines for text effects.\n\n`
  }

  if (scanResult.errors.length > 0) {
    report += `## Errors\n\n`
    scanResult.errors.forEach(error => {
      report += `- ${error}\n`
    })
  }

  return report
}
