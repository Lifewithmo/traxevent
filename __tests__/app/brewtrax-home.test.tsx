import { render, screen } from '@testing-library/react'

// StorePreview -> DropStorefront -> SubscribeCard statically imports the real
// subscribeToDrops server action, whose module chain reaches
// lib/firebase-admin and throws without Firebase env vars. Mock it the same
// way __tests__/components/marketing/StorePreview.test.tsx does.
vi.mock('@/actions/storefront-public', () => ({ subscribeToDrops: vi.fn().mockResolvedValue({ ok: true }) }))

import Home from '@/app/(marketing)/brand/[brandId]/page'

test('home leads with the coffee-cart headline and shows the fee autopsy at the fold', async () => {
  const ui = await Home({ params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  // Scoped by accessible name: StorePreview embeds DropStorefront, which has
  // its own <h1> (the drop title) for its real standalone route — a second
  // page-level h1 once assembled here, so a bare level-1 query is ambiguous.
  expect(screen.getByRole('heading', { level: 1, name: /every dollar/i })).toHaveTextContent(/every dollar/i)
  // FeeAutopsy present in the hero (its result testid)
  expect(screen.getByTestId('autopsy-annual-kept')).toBeInTheDocument()
  // drops escape-hatch to the vs page
  expect(screen.getByRole('link', { name: /just here for drops/i }))
    .toHaveAttribute('href', '/brand/brewtrax/vs/hotplate')
  // proof is the honest empty state, not a fake quote
  expect(screen.getByText(/we’re new|we're new/i)).toBeInTheDocument()
})
