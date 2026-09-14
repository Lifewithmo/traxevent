import { render, screen, fireEvent } from '@testing-library/react'

// DropStorefront always statically imports SubscribeCard, which imports the
// real subscribeToDrops server action — that module chain reaches
// lib/firebase-admin, which throws without Firebase env vars. Mock it the
// same way __tests__/components/storefront/DropStorefront.test.tsx does;
// these tests never reach the upcoming/ended states that use it.
vi.mock('@/actions/storefront-public', () => ({ subscribeToDrops: vi.fn().mockResolvedValue({ ok: true }) }))

import { StorePreview } from '@/components/marketing/StorePreview'

// DropStorefront hits branding helpers; render it for real but assert on the name echo.
test('echoes the typed cart name into the previewed store header', () => {
  render(<StorePreview />)
  const input = screen.getByLabelText(/cart name/i)
  fireEvent.change(input, { target: { value: 'Love Brew' } })
  expect(screen.getByTestId('store-preview')).toHaveTextContent('Love Brew')
})

test('never renders blank — shows a sample cart name by default', () => {
  render(<StorePreview />)
  expect(screen.getByTestId('store-preview')).toHaveTextContent(/your cart/i)
})
