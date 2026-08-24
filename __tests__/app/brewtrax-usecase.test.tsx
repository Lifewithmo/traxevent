import { render, screen } from '@testing-library/react'
import UseCase from '@/app/(marketing)/brand/[brandId]/for/mobile-beverage/page'

test('speaks to the three operator types', async () => {
  const ui = await UseCase({ params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  expect(screen.getByText(/coffee cart/i)).toBeInTheDocument()
  expect(screen.getByText(/mobile bar/i)).toBeInTheDocument()
})
