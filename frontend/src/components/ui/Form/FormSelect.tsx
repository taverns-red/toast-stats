import React from 'react'
import { FormSelectProps } from './types'

/**
 * FormSelect - Brand-compliant select component
 *
 * Uses TM Cool Gray backgrounds, proper focus states with TM Loyal Blue,
 * and ensures minimum touch target requirements.
 *
 * Requirements: 4.2, 2.2, 1.3, 3.1, 3.2
 */
export const FormSelect: React.FC<FormSelectProps> = ({
  className = '',
  error = false,
  placeholder,
  children,
  ...props
}) => {
  const baseClasses = 'tm-form-select tm-body'
  const stateClasses = [error && 'tm-form-select--error']
    .filter(Boolean)
    .join(' ')

  return (
    <div className="tm-form-select-wrapper">
      <select
        className={`${baseClasses} ${stateClasses} ${className}`.trim()}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <div className="tm-form-select__icon" aria-hidden="true">
        <svg
          width="12"
          height="8"
          viewBox="0 0 12 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 1.5L6 6.5L11 1.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}
