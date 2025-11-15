'use client'

import { useRef, KeyboardEvent, ClipboardEvent, ChangeEvent } from 'react'

interface OTPInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
}

export function OTPInput({ value, onChange, disabled = false, autoFocus = false }: OTPInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value

    // Only allow digits
    if (val && !/^\d$/.test(val)) {
      return
    }

    // Update value
    const newValue = value.split('')
    newValue[index] = val
    onChange(newValue.join(''))

    // Auto-focus next input
    if (val && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace') {
      if (!value[index] && index > 0) {
        // If current box is empty, go to previous box
        inputRefs.current[index - 1]?.focus()
      } else {
        // Clear current box
        const newValue = value.split('')
        newValue[index] = ''
        onChange(newValue.join(''))
      }
    }

    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').trim()

    // Only process if it's 6 digits
    if (/^\d{6}$/.test(pastedData)) {
      onChange(pastedData)
      // Focus last input
      inputRefs.current[5]?.focus()
    }
  }

  const handleFocus = (index: number) => {
    // Select all text on focus for easy replacement
    inputRefs.current[index]?.select()
  }

  return (
    <div className="flex gap-2 justify-center">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={() => handleFocus(index)}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          className="w-12 h-14 text-center text-2xl font-mono font-bold border border-border rounded-md bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  )
}
