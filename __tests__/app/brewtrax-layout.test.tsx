import { render, screen } from '@testing-library/react'
import BrandLayout from '@/app/(marketing)/brand/[brandId]/layout'

test('renders BrewTrax nav with a Start free CTA to the app origin', async () => {
  const ui = await BrandLayout({ children: <div>page</div>, params: Promise.resolve({ brandId: 'brewtrax' }) })
  render(ui)
  const cta = screen.getByRole('link', { name: /start free/i })
  expect(cta).toHaveAttribute('href', 'https://traxevent.com/signup?brand=brewtrax')
  expect(screen.getByRole('link', { name: /vs hot plate/i })).toBeInTheDocument()
})
