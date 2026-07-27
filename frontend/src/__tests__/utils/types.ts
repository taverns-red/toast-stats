/**
 * TypeScript interfaces for enhanced test utility infrastructure
 *
 * Provides comprehensive type definitions for test utilities, performance monitoring,
 * and migration validation framework.
 */

import { ReactElement, ComponentType } from 'react'
import { RenderOptions } from '@testing-library/react'

// Core test utility interfaces
export interface TestUtilityOptions {
  skipProviders?: boolean
  customProviders?: ComponentType<Record<string, unknown>>[]
  testId?: string
  timeout?: number
  skipCleanup?: boolean
}

export interface ComponentVariant<T extends Record<string, unknown>> {
  name: string
  props: T
  expectedText?: string
  expectedClass?: string
  expectedAttribute?: { name: string; value: string }
  expectedRole?: string
  expectedAriaLabel?: string
}

export interface TestLoadingStates<T> {
  loadingProps: T
  loadedProps: T
  errorProps?: T
  expectedLoadingText?: string
  expectedErrorText?: string
}

// Performance monitoring interfaces
export interface TestPerformanceMetrics {
  renderTime: number
  queryTime: number
  interactionTime: number
  memoryUsage: number
  componentCount: number
  timestamp: Date
}

export interface TestPerformanceThresholds {
  maxRenderTime: number
  maxQueryTime: number
  maxInteractionTime: number
  maxMemoryUsage: number
  maxComponentCount: number
}

export interface TestPerformanceReport {
  testName: string
  metrics: TestPerformanceMetrics
  thresholds: TestPerformanceThresholds
  passed: boolean
  violations: string[]
}

// Migration validation interfaces
export interface TestMigrationValidation {
  originalTestPath: string
  migratedTestPath: string
  coverageComparison: CoverageComparison
  performanceComparison: PerformanceComparison
  functionalityValidation: FunctionalityValidation
}

export interface CoverageComparison {
  originalCoverage: TestCoverage
  migratedCoverage: TestCoverage
  coveragePreserved: boolean
  coverageImproved: boolean
  missingCoverage: string[]
}

export interface TestCoverage {
  lines: number
  functions: number
  branches: number
  statements: number
  percentage: number
}

export interface PerformanceComparison {
  originalMetrics: TestPerformanceMetrics
  migratedMetrics: TestPerformanceMetrics
  performanceImproved: boolean
  performanceDegraded: boolean
  improvementPercentage: number
}

export interface FunctionalityValidation {
  allTestsPassing: boolean
  identicalBehavior: boolean
  noRegressions: boolean
  validationErrors: string[]
}

// Brand compliance interfaces
export interface BrandComplianceConfig {
  enforceColors: boolean
  enforceTypography: boolean
  enforceTouchTargets: boolean
  enforceGradients: boolean
  enforceSpacing: boolean
  enforceAccessibility: boolean
}

export interface BrandComplianceResult {
  component: string
  passed: boolean
  violations: BrandViolation[]
  score: number
}

export interface BrandViolation {
  type:
    | 'color'
    | 'typography'
    | 'touch-target'
    | 'gradient'
    | 'spacing'
    | 'accessibility'
  severity: 'error' | 'warning' | 'info'
  message: string
  element?: string
  expectedValue?: string
  actualValue?: string
}

// Accessibility testing interfaces
export interface AccessibilityConfig {
  wcagLevel: 'A' | 'AA' | 'AAA'
  enforceKeyboardNavigation: boolean
  enforceColorContrast: boolean
  enforceScreenReader: boolean
  enforceFocusManagement: boolean
  enforceSemanticHTML: boolean
}

export interface AccessibilityResult {
  component: string
  passed: boolean
  violations: AccessibilityViolation[]
  score: number
}

export interface AccessibilityViolation {
  type:
    'wcag' | 'keyboard' | 'contrast' | 'screen-reader' | 'focus' | 'semantic'
  severity: 'error' | 'warning' | 'info'
  message: string
  element?: string
  wcagCriterion?: string
  contrastRatio?: number
  expectedRatio?: number
}

// Test suite optimization interfaces
export interface TestSuiteMetrics {
  totalTests: number
  totalFiles: number
  totalLines: number
  redundantPatterns: number
  executionTime: number
  passRate: number
  memoryUsage: number
}

export interface OptimizationTarget {
  codeReductionPercentage: number
  executionTimeLimit: number
  passRateMinimum: number
  memoryUsageLimit: number
}

export interface OptimizationResult {
  beforeMetrics: TestSuiteMetrics
  afterMetrics: TestSuiteMetrics
  improvements: {
    codeReduction: number
    executionTimeImprovement: number
    passRateChange: number
    memoryUsageChange: number
  }
  targetsMet: boolean
  failedTargets: string[]
}

// Property-based testing interfaces
export interface PropertyTestConfig {
  iterations: number
  seed?: number
  timeout: number
  shrinkingEnabled: boolean
  verbose: boolean
}

export interface PropertyTestResult {
  property: string
  passed: boolean
  iterations: number
  counterExample?: unknown
  shrunkCounterExample?: unknown
  executionTime: number
  error?: string
}

// Test utility function signatures
export type RenderWithProvidersFunction = (
  ui: ReactElement,
  options?: TestUtilityOptions & Omit<RenderOptions, 'wrapper'>
) => ReturnType<typeof import('@testing-library/react').render>

export type TestComponentVariantsFunction = <T extends Record<string, unknown>>(
  Component: ComponentType<T>,
  variants: ComponentVariant<T>[],
  options?: TestUtilityOptions
) => void

export type ExpectBasicRenderingFunction = (
  component: ReactElement,
  testId?: string,
  options?: TestUtilityOptions
) => void

export type RunBrandComplianceTestSuiteFunction = (
  component: ReactElement,
  config?: Partial<BrandComplianceConfig>
) => BrandComplianceResult

export type RunAccessibilityTestSuiteFunction = (
  component: ReactElement,
  config?: Partial<AccessibilityConfig>
) => AccessibilityResult

// Test infrastructure interfaces
export interface TestInfrastructure {
  performanceMonitor: TestPerformanceMonitor
  migrationValidator: TestMigrationValidator
  brandComplianceValidator: BrandComplianceValidator
  accessibilityValidator: AccessibilityValidator
  metricsCollector: TestMetricsCollector
}

export interface TestPerformanceMonitor {
  startMonitoring(testName: string): void
  stopMonitoring(testName: string): TestPerformanceMetrics
  getReport(testName: string): TestPerformanceReport
  setThresholds(thresholds: Partial<TestPerformanceThresholds>): void
}

export interface TestMigrationValidator {
  validateMigration(validation: TestMigrationValidation): boolean
  compareCoverage(original: string, migrated: string): CoverageComparison
  comparePerformance(
    original: TestPerformanceMetrics,
    migrated: TestPerformanceMetrics
  ): PerformanceComparison
  validateFunctionality(
    originalPath: string,
    migratedPath: string
  ): FunctionalityValidation
}

export interface BrandComplianceValidator {
  validate(
    component: ReactElement,
    config?: Partial<BrandComplianceConfig>
  ): BrandComplianceResult
  validateColors(element: Element): BrandViolation[]
  validateTypography(element: Element): BrandViolation[]
  validateTouchTargets(element: Element): BrandViolation[]
  validateGradients(element: Element): BrandViolation[]
  validateSpacing(element: Element): BrandViolation[]
}

export interface AccessibilityValidator {
  validate(
    component: ReactElement,
    config?: Partial<AccessibilityConfig>
  ): AccessibilityResult
  validateWCAG(
    element: Element,
    level: 'A' | 'AA' | 'AAA'
  ): AccessibilityViolation[]
  validateKeyboardNavigation(element: Element): AccessibilityViolation[]
  validateColorContrast(element: Element): AccessibilityViolation[]
  validateScreenReader(element: Element): AccessibilityViolation[]
  validateFocusManagement(element: Element): AccessibilityViolation[]
}

export interface TestMetricsCollector {
  collectSuiteMetrics(): TestSuiteMetrics
  collectOptimizationMetrics(
    before: TestSuiteMetrics,
    after: TestSuiteMetrics
  ): OptimizationResult
  trackPerformance(testName: string, metrics: TestPerformanceMetrics): void
  generateReport(): TestSuiteOptimizationReport
}

export interface TestSuiteOptimizationReport {
  summary: {
    totalOptimizations: number
    codeReductionAchieved: number
    performanceImprovement: number
    targetsMet: number
    targetsTotal: number
  }
  details: {
    optimizations: OptimizationResult[]
    performanceReports: TestPerformanceReport[]
    migrationValidations: TestMigrationValidation[]
  }
  recommendations: string[]
}
