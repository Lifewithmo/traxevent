import { render, screen } from '@testing-library/react'
import { ComparisonMatrix } from '@/components/marketing/ComparisonMatrix'
import { ProofWallEmpty } from '@/components/marketing/ProofWallEmpty'
import { ObjectionBand } from '@/components/marketing/ObjectionBand'
import { CtaBand } from '@/components/marketing/CtaBand'

test('ComparisonMatrix contrasts the per-order fee', () => {
  render(<ComparisonMatrix />)
  expect(screen.getByText(/5% \+ 55¢/)).toBeInTheDocument()
  expect(screen.getByText(/\$0 per order/i)).toBeInTheDocument()
})

test('ProofWallEmpty is founder-honest, not a fake testimonial', () => {
  render(<ProofWallEmpty />)
  expect(screen.getByText(/we’re new|we're new/i)).toBeInTheDocument()
  expect(screen.getByText(/export/i)).toBeInTheDocument()
})

test('ObjectionBand renders each objection', () => {
  render(<ObjectionBand items={[{ q: 'Can I leave?', a: 'Export anytime.' }]} />)
  expect(screen.getByText('Can I leave?')).toBeInTheDocument()
})

test('CtaBand links to signup for the brand', () => {
  render(<CtaBand brandId="brewtrax" title="Keep what you earn." cta="Claim your page" />)
  expect(screen.getByRole('link', { name: /claim your page/i }))
    .toHaveAttribute('href', 'https://traxevent.com/signup?brand=brewtrax')
})
