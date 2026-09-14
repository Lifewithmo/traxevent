import { render, screen } from '@testing-library/react'
import Pricing from '@/app/(marketing)/brand/[brandId]/pricing/page'

test('renders three tiers with $79 anchored and 0% per order on all', async () => {
  const ui = await Pricing({ params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  expect(screen.getByText('$39')).toBeInTheDocument()
  expect(screen.getByText('$79')).toBeInTheDocument()
  expect(screen.getByText('$149')).toBeInTheDocument()
  expect(screen.getByText(/most popular/i)).toBeInTheDocument()
  expect(screen.getByText(/0% per order/i)).toBeInTheDocument()
})
