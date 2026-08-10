import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrandingClient } from '@/components/admin/BrandingClient'

const updateTermsSpy = vi.hoisted(() => vi.fn().mockResolvedValue('Stored terms.'))
vi.mock('@/actions/orgs', () => ({
  updateOrgBranding: vi.fn(),
  updateOrgDefaultProposalTerms: updateTermsSpy,
}))
vi.mock('@/actions/org-assets', () => ({ uploadOrgAsset: vi.fn() }))

describe('BrandingClient proposal terms', () => {
  it('edits and saves the org default terms', async () => {
    render(<BrandingClient orgId="org-1" orgName="Acme" initialBranding={{}} initialDefaultTerms="Old terms." />)
    const box = screen.getByLabelText('Proposal terms')
    expect(box).toHaveValue('Old terms.')
    fireEvent.change(box, { target: { value: 'New terms.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save terms' }))
    await waitFor(() => expect(updateTermsSpy).toHaveBeenCalledWith('org-1', 'New terms.'))
    // Re-seeds from the server's normalized truth
    await waitFor(() => expect(box).toHaveValue('Stored terms.'))
  })
})
