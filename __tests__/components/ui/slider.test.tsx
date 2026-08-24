import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { Slider } from '@/components/ui/slider'

test('renders an accessible slider thumb with the given value and range', () => {
  render(
    <Slider value={20} onValueChange={() => {}} min={0} max={100} aria-label="Orders per drop" />
  )
  const slider = screen.getByRole('slider', { name: 'Orders per drop' })
  expect(slider).toHaveAttribute('aria-valuenow', '20')
  expect(slider).toHaveAttribute('aria-valuemin', '0')
  expect(slider).toHaveAttribute('aria-valuemax', '100')
})
