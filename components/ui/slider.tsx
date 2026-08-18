'use client'
import { useLayoutEffect, useRef } from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from '@/lib/utils'

export function Slider({
  value, onValueChange, min, max, step = 1, id, className,
  'aria-label': ariaLabel,
}: {
  value: number
  onValueChange: (v: number) => void
  min: number
  max: number
  step?: number
  id?: string
  className?: string
  'aria-label': string
}) {
  // Base UI's thumb input relies on native min/max for the browser to derive
  // aria-valuemin/aria-valuemax; it doesn't set those aria-* attributes
  // explicitly. Set them ourselves so assistive tech (and tests reading raw
  // attributes) can rely on them directly.
  const inputRef = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    inputRef.current?.setAttribute('aria-valuemin', String(min))
    inputRef.current?.setAttribute('aria-valuemax', String(max))
  }, [min, max, value])

  return (
    <SliderPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(Array.isArray(v) ? v[0] : v)}
      min={min}
      max={max}
      step={step}
      className={cn('relative flex w-full touch-none select-none items-center py-2', className)}
    >
      <SliderPrimitive.Control className="flex w-full items-center">
        <SliderPrimitive.Track className="h-1.5 w-full rounded-full bg-copper-100">
          <SliderPrimitive.Indicator className="rounded-full bg-copper-500" />
          <SliderPrimitive.Thumb
            id={id}
            aria-label={ariaLabel}
            inputRef={inputRef}
            className="size-5 rounded-full bg-copper-600 shadow ring-2 ring-white focus-visible:outline-2 focus-visible:outline-copper-700"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}
