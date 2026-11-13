import React, { useId } from 'react'
import { FormCheckboxProps } from './types'

/**
 * FormCheckbox - Brand-compliant checkbox component
 *
 * Uses TM Loyal Blue for checked states, proper focus indicators,
 * and ensures minimum touch target requirements.
 *
 * Requirements: 4.2, 2.2, 1.1, 3.1, 3.2
 */
export const FormCheckbox: React.FC<FormCheckboxProps> = ({
  className = '',
  label,
  error = false,
  id,
  ...props
}) => {
  const generatedId = useId()
  const baseClasses = 'tm-form-checkbox'
  const stateClasses = [error && 'tm-form-checkbox--error']
    .filter(Boolean)
    .join(' ')

  const checkboxId = id || `checkbox-${generatedId}`

  return (
    <div
      className={`tm-form-checkbox-wrapper ${stateClasses} ${className}`.trim()}
    >
      <input
        type="checkbox"
        id={checkboxId}
        className={`${baseClasses}`.trim()}
        {...props}
      />
      {label && (
        <label htmlFor={checkboxId} className="tm-form-checkbox__label tm-body">
          {label}
        </label>
      )}
    </div>
  )
}
