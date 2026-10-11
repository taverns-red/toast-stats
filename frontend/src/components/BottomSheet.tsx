import type React from 'react'

/* #1831 red stub — implemented in the next commit. */
export const SWIPE_CLOSE_PX = 60

export interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  closeLabel?: string
  id?: string
}

export const BottomSheet: React.FC<BottomSheetProps> = () => null
