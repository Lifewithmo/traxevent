import { render, screen } from '@testing-library/react'
import { FeeAutopsy } from '@/components/marketing/FeeAutopsy'

test('renders a non-zero annual-kept figure from the default inputs', () => {
  render(<FeeAutopsy />)
  // defaults: 25×4=100 orders/mo, $18 avg → rev $1,800/mo
  // hp fee/mo = 0.05×1800 + 0.55×100 = 90 + 55 = 145 → annual 1,740
  expect(screen.getByTestId('autopsy-annual-kept')).toHaveTextContent('$1,740')
  // three labelled sliders present and accessible
  expect(screen.getByRole('slider', { name: /orders per drop/i })).toBeInTheDocument()
  expect(screen.getByRole('slider', { name: /drops per month/i })).toBeInTheDocument()
  expect(screen.getByRole('slider', { name: /average order/i })).toBeInTheDocument()
})
