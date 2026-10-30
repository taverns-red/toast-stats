/**
 * Unit tests for ProgramYearSelector error handling
 * Feature: firestore-index-fix
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 *
 * These tests verify that the ProgramYearSelector component correctly:
 * - Renders error state when isError=true (4.3)
 * - Renders custom error message when provided (4.3)
 * - Renders retry button when onRetry is provided (4.3)
 * - Calls onRetry when retry button is clicked (4.4)
 * - Renders empty state when availableProgramYears is empty (4.2)
 * - Renders loading state when isLoading=true
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProgramYearSelector } from '../ProgramYearSelector'
import type { ProgramYear } from '../../utils/programYear'
import { USER_PICK } from '../../hooks/useUrlProgramYear'

// Helper to create mock program years
const createMockProgramYear = (year: number): ProgramYear => ({
  year,
  startDate: `${year}-07-01`,
  endDate: `${year + 1}-06-30`,
  label: `${year}-${year + 1}`,
})

// Create mock program years for testing
const mockProgramYears: ProgramYear[] = [
  createMockProgramYear(2024),
  createMockProgramYear(2023),
  createMockProgramYear(2022),
]

const defaultProps = {
  availableProgramYears: mockProgramYears,
  selectedProgramYear: mockProgramYears[0]!,
  onProgramYearChange: vi.fn(),
}

describe('ProgramYearSelector Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Error State Rendering', () => {
    /**
     * Test that error state renders when isError=true
     *
     * **Validates: Requirement 4.3**
     * WHEN the Program_Year_Selector is in an error state
     * THEN THE consuming component SHALL display a user-friendly error message
     */
    it('should render error state when isError=true', () => {
      render(<ProgramYearSelector {...defaultProps} isError={true} />)

      // Should show error alert
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()

      // Should show default error message
      expect(
        screen.getByText('Unable to load program years. Please try again.')
      ).toBeInTheDocument()

      // Should not show the select dropdown
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    })

    /**
     * Test that custom error message is displayed when provided
     *
     * **Validates: Requirement 4.3**
     */
    it('should render custom error message when provided', () => {
      const customMessage = 'Custom error: Server unavailable'

      render(
        <ProgramYearSelector
          {...defaultProps}
          isError={true}
          errorMessage={customMessage}
        />
      )

      expect(screen.getByText(customMessage)).toBeInTheDocument()
      expect(
        screen.queryByText('Unable to load program years. Please try again.')
      ).not.toBeInTheDocument()
    })

    /**
     * Test that error state includes error icon
     *
     * **Validates: Requirement 4.3**
     */
    it('should display error icon in error state', () => {
      const { container } = render(
        <ProgramYearSelector {...defaultProps} isError={true} />
      )

      // Check for SVG error icon
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    /**
     * Test that error state has proper accessibility attributes
     *
     * **Validates: Requirement 4.3**
     */
    it('should have proper accessibility attributes in error state', () => {
      render(<ProgramYearSelector {...defaultProps} isError={true} />)

      const alert = screen.getByRole('alert')
      expect(alert).toHaveAttribute('aria-live', 'polite')
    })

    /**
     * Test that error state still shows the label
     *
     * **Validates: Requirement 4.3**
     */
    it('should show Program Year label in error state', () => {
      render(<ProgramYearSelector {...defaultProps} isError={true} />)

      expect(screen.getByText('Program Year')).toBeInTheDocument()
    })
  })

  describe('Retry Button Functionality', () => {
    /**
     * Test that retry button is displayed when onRetry is provided
     *
     * **Validates: Requirement 4.4**
     * THE Program_Year_Selector hook SHALL expose a refetch function for retry attempts
     */
    it('should display retry button when onRetry is provided', () => {
      const onRetry = vi.fn()

      render(
        <ProgramYearSelector
          {...defaultProps}
          isError={true}
          onRetry={onRetry}
        />
      )

      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toBeInTheDocument()
    })

    /**
     * Test that retry button is NOT displayed when onRetry is not provided
     *
     * **Validates: Requirement 4.4**
     */
    it('should not display retry button when onRetry is not provided', () => {
      render(<ProgramYearSelector {...defaultProps} isError={true} />)

      expect(
        screen.queryByRole('button', { name: /retry/i })
      ).not.toBeInTheDocument()
    })

    /**
     * Test that retry button calls onRetry when clicked
     *
     * **Validates: Requirement 4.4**
     */
    it('should call onRetry when retry button is clicked', () => {
      const onRetry = vi.fn()

      render(
        <ProgramYearSelector
          {...defaultProps}
          isError={true}
          onRetry={onRetry}
        />
      )

      const retryButton = screen.getByRole('button', { name: /retry/i })
      fireEvent.click(retryButton)

      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    /**
     * Test that retry button has proper accessibility label
     *
     * **Validates: Requirement 4.4**
     */
    it('should have accessible retry button with aria-label', () => {
      const onRetry = vi.fn()

      render(
        <ProgramYearSelector
          {...defaultProps}
          isError={true}
          onRetry={onRetry}
        />
      )

      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toHaveAttribute(
        'aria-label',
        'Retry loading program years'
      )
    })
  })

  describe('Empty State Rendering', () => {
    /**
     * Test that empty state renders when availableProgramYears is empty
     *
     * **Validates: Requirement 4.2**
     * WHEN the available program years API returns an empty array
     * THEN THE Program_Year_Selector component SHALL display a message indicating no program years are available
     */
    it('should render empty state when availableProgramYears is empty', () => {
      render(
        <ProgramYearSelector {...defaultProps} availableProgramYears={[]} />
      )

      expect(
        screen.getByText(
          'No program years available. Data may not have been collected yet.'
        )
      ).toBeInTheDocument()

      // Should not show the select dropdown
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    })

    /**
     * Test that empty state has proper accessibility attributes
     *
     * **Validates: Requirement 4.2**
     */
    it('should have proper accessibility attributes in empty state', () => {
      render(
        <ProgramYearSelector {...defaultProps} availableProgramYears={[]} />
      )

      const status = screen.getByRole('status')
      expect(status).toBeInTheDocument()
      expect(status).toHaveAttribute('aria-live', 'polite')
    })

    /**
     * Test that empty state includes calendar icon
     *
     * **Validates: Requirement 4.2**
     */
    it('should display calendar icon in empty state', () => {
      const { container } = render(
        <ProgramYearSelector {...defaultProps} availableProgramYears={[]} />
      )

      // Check for SVG calendar icon
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    /**
     * Test that empty state still shows the label
     *
     * **Validates: Requirement 4.2**
     */
    it('should show Program Year label in empty state', () => {
      render(
        <ProgramYearSelector {...defaultProps} availableProgramYears={[]} />
      )

      expect(screen.getByText('Program Year')).toBeInTheDocument()
    })
  })

  describe('Loading State Rendering', () => {
    /**
     * Test that loading state renders when isLoading=true
     */
    it('should render loading state when isLoading=true', () => {
      const { container } = render(
        <ProgramYearSelector {...defaultProps} isLoading={true} />
      )

      // Should show loading skeleton with animate-pulse
      const loadingElements = container.querySelectorAll('.animate-pulse')
      expect(loadingElements.length).toBeGreaterThan(0)

      // Should not show the select dropdown
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    })

    /**
     * Test that loading state does not show error or empty states
     */
    it('should not show error or empty states when loading', () => {
      render(<ProgramYearSelector {...defaultProps} isLoading={true} />)

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  describe('State Priority', () => {
    /**
     * Test that loading state takes priority over error state
     */
    it('should show loading state even when isError is also true', () => {
      const { container } = render(
        <ProgramYearSelector
          {...defaultProps}
          isLoading={true}
          isError={true}
        />
      )

      // Should show loading skeleton
      const loadingElements = container.querySelectorAll('.animate-pulse')
      expect(loadingElements.length).toBeGreaterThan(0)

      // Should not show error alert
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    /**
     * Test that error state takes priority over empty state
     */
    it('should show error state even when availableProgramYears is empty', () => {
      render(
        <ProgramYearSelector
          {...defaultProps}
          availableProgramYears={[]}
          isError={true}
        />
      )

      // Should show error alert
      expect(screen.getByRole('alert')).toBeInTheDocument()

      // Should not show empty state message
      expect(
        screen.queryByText(
          'No program years available. Data may not have been collected yet.'
        )
      ).not.toBeInTheDocument()
    })
  })

  describe('Normal State Rendering', () => {
    /**
     * Test that normal state renders correctly with program years
     */
    it('should render select dropdown with program years in normal state', () => {
      render(<ProgramYearSelector {...defaultProps} />)

      const select = screen.getByRole('combobox')
      expect(select).toBeInTheDocument()

      // Should have options for each program year
      mockProgramYears.forEach(py => {
        expect(screen.getByText(py.label)).toBeInTheDocument()
      })
    })

    /**
     * Test that onProgramYearChange is called when selection changes
     */
    it('should call onProgramYearChange when selection changes', () => {
      const onProgramYearChange = vi.fn()

      render(
        <ProgramYearSelector
          {...defaultProps}
          onProgramYearChange={onProgramYearChange}
        />
      )

      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: '2023' } })

      expect(onProgramYearChange).toHaveBeenCalledTimes(1)
      expect(onProgramYearChange).toHaveBeenCalledWith(
        mockProgramYears[1],
        USER_PICK
      )
    })
  })
})
