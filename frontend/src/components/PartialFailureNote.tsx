import React from 'react'

interface PartialFailureNoteProps {
  subject: string
  onRetry?: () => void
  children?: React.ReactNode
}

export const PartialFailureNote: React.FC<PartialFailureNoteProps> = () => null
