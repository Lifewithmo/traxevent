import { render, screen } from '@testing-library/react'
import VsHotplate from '@/app/(marketing)/brand/[brandId]/vs/hotplate/page'

test('renders the comparison and the embedded calculator', async () => {
  const ui = await VsHotplate({ params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  expect(screen.getByText(/5% \+ 55¢/)).toBeInTheDocument()
  expect(screen.getByTestId('autopsy-annual-kept')).toBeInTheDocument()
})
