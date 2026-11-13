import React from 'react'
import { FormInputProps } from './types'

/**
 * FormInput - Brand-compliant input component
 *
 * Uses TM Cool Gray backgrounds, proper focus states with TM Loyal Blue,
 * and ensures minimum touch target requirements.
 *
 * Requirements: 4.2, 2.2, 1.3, 3.1, 3.2
 */
export const FormInput: React.FC<FormInputProps> = ({
  className = '',
  error = false,
  size = 'md',
  ...props
}) => {
  const baseClasses = 'tm-form-input tm-body'
  const sizeClasses = {
    sm: 'tm-form-input--sm',
    md: 'tm-form-input--md',
    lg: 'tm-form-input--lg',
  }
  const stateClasses = [error && 'tm-form-input--error']
    .filter(Boolean)
    .join(' ')

  return (
    <input
      className={`${baseClasses} ${sizeClasses[size]} ${stateClasses} ${className}`.trim()}
      {...props}
    />
  )
}
