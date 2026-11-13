import React, { useId } from 'react'
import { FormRadioProps } from './types'

/**
 * FormRadio - Brand-compliant radio button component
 *
 * Uses TM Loyal Blue for selected states, proper focus indicators,
 * and ensures minimum touch target requirements.
 *
 * Requirements: 4.2, 2.2, 1.1, 3.1, 3.2
 */
export const FormRadio: React.FC<FormRadioProps> = ({
  className = '',
  label,
  error = false,
  id,
  ...props
}) => {
  const generatedId = useId()
  const baseClasses = 'tm-form-radio'
  const stateClasses = [error && 'tm-form-radio--error']
    .filter(Boolean)
    .join(' ')

  const radioId = id || `radio-${generatedId}`

  return (
    <div
      className={`tm-form-radio-wrapper ${stateClasses} ${className}`.trim()}
    >
      <input
        type="radio"
        id={radioId}
        className={`${baseClasses}`.trim()}
        {...props}
      />
      {label && (
        <label htmlFor={radioId} className="tm-form-radio__label tm-body">
          {label}
        </label>
      )}
    </div>
  )
}
