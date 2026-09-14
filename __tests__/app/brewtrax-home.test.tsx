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
  // Exactly one h1 on the page: StorePreview embeds DropStorefront, which
  // demotes its drop-title heading to h2 in this context (titleAs="h2") so
  // the hero headline stays the page's sole top-level heading.
  const h1s = screen.getAllByRole('heading', { level: 1 })
  expect(h1s).toHaveLength(1)
  expect(h1s[0]).toHaveTextContent(/every dollar/i)
  // FeeAutopsy present in the hero (its result testid)
  expect(screen.getByTestId('autopsy-annual-kept')).toBeInTheDocument()
  // drops escape-hatch to the vs page
  expect(screen.getByRole('link', { name: /just here for drops/i }))
    .toHaveAttribute('href', '/brand/brewtrax/vs/hotplate')
  // proof is the honest empty state, not a fake quote
  expect(screen.getByText(/we’re new|we're new/i)).toBeInTheDocument()
})
