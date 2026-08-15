import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// These are async server components: await the component to get its element
// tree, then render that. Guards and data actions are mocked, so none of the
// firebase-admin graph is pulled in.
vi.mock('@/lib/auth/guards', () => ({
  requireOrgMember: vi.fn(async () => ({
    orgId: 'org1',
    org: { name: 'Acme Events', industry_pack_id: 'general' },
  })),
}))

const catalogOverview = vi.hoisted(() => vi.fn())
const moneyOverview = vi.hoisted(() => vi.fn())
const settingsOverview = vi.hoisted(() => vi.fn())

vi.mock('@/actions/catalog-overview', () => ({ getCatalogOverview: catalogOverview }))
vi.mock('@/actions/money-overview', () => ({ getMoneyOverview: moneyOverview }))
vi.mock('@/actions/settings-overview', () => ({ getSettingsOverview: settingsOverview }))

import CatalogPage from '@/app/(admin)/[orgSlug]/catalog/page'
import MoneyPage from '@/app/(admin)/[orgSlug]/money/page'
import SettingsPage from '@/app/(admin)/[orgSlug]/settings/page'

const params = Promise.resolve({ orgSlug: 'acme' })

describe('Catalog overview page', () => {
  it('still offers the section links when the catalog is empty', async () => {
    catalogOverview.mockResolvedValue({
      expiring: [],
      vendorCount: 0,
      formCount: 0,
      complianceCount: 0,
      packageCount: 0,
    })
    render(await CatalogPage({ params }))
    // A brand-new org lands here with nothing to show; it must still be able
    // to get to the pages that fill it.
    expect(screen.getByRole('link', { name: /Vendors/ })).toHaveAttribute('href', '/acme/vendors')
    expect(screen.getByRole('link', { name: /Forms/ })).toHaveAttribute('href', '/acme/forms')
    expect(screen.getByRole('link', { name: 'Compliance' })).toHaveAttribute('href', '/acme/compliance')
  })

  it('opens the document line with a capital letter', async () => {
    catalogOverview.mockResolvedValue({
      expiring: [],
      vendorCount: 2,
      formCount: 0,
      complianceCount: 0,
      packageCount: 1,
    })
    render(await CatalogPage({ params }))
    expect(screen.getByText('All current — nothing expiring in the next 60 days')).toBeInTheDocument()
  })

  it('capitalises the expiring-soon line', async () => {
    catalogOverview.mockResolvedValue({
      expiring: [{ id: 'd1', name: 'COI', daysLeft: 12 }],
      vendorCount: 1,
      formCount: 0,
      complianceCount: 1,
      packageCount: 0,
    })
    render(await CatalogPage({ params }))
    expect(screen.getByText('Expiring within 60 days')).toBeInTheDocument()
  })
})

describe('Money overview page', () => {
  it('capitalises every sentence-style caption', async () => {
    moneyOverview.mockResolvedValue({
      overdue: 0,
      overdueCount: 0,
      overdueInvoices: [],
      outstanding: 1200,
      paidThisMonth: 400,
      aging: { d1_30: 1200, d31_60: 0, d61_90: 0, d90_plus: 0 },
    })
    render(await MoneyPage({ params }))
    expect(screen.getByText('Nothing overdue — all invoices are current')).toBeInTheDocument()
    expect(screen.getByText('Everything issued and unpaid')).toBeInTheDocument()
    expect(screen.getByText('Payments recorded so far')).toBeInTheDocument()
  })
})

describe('Settings overview page', () => {
  it('capitalises the unconfigured-areas caption', async () => {
    settingsOverview.mockResolvedValue({
      memberCount: 3,
      areas: [
        { slug: 'branding', label: 'Branding', configured: false },
        { slug: 'public-profile', label: 'Public profile', configured: false },
        { slug: 'members', label: 'Members', configured: true },
      ],
    })
    render(await SettingsPage({ params }))
    // The pluralised "Area{s}" splits into sibling text nodes, so match on the
    // paragraph's assembled text.
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.trim() === 'Areas clients may notice'),
    ).toBeInTheDocument()
  })
})
