import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const updateOrgBranding = vi.hoisted(() => vi.fn())
const uploadOrgAsset = vi.hoisted(() => vi.fn())
vi.mock('@/actions/orgs', () => ({ updateOrgBranding }))
vi.mock('@/actions/org-assets', () => ({ uploadOrgAsset }))

import { BrandingClient } from '@/components/admin/BrandingClient'

beforeEach(() => vi.clearAllMocks())

const baseProps = {
  orgId: 'o1',
  orgName: 'Gem State Events',
  initialBranding: { accent_color: '#1d4ed8' },
}

describe('BrandingClient', () => {
  it('renders existing branding and the org-name fallback hint', () => {
    render(<BrandingClient {...baseProps} initialDefaultTerms="" />)
    expect(screen.getByLabelText(/display name/i)).toHaveValue('')
    expect(screen.getByPlaceholderText('Gem State Events')).toBeTruthy()
    expect(screen.getByLabelText(/accent color hex/i)).toHaveValue('#1d4ed8')
  })

  it('saves edited branding through updateOrgBranding and reflects the response', async () => {
    updateOrgBranding.mockResolvedValue({ display_name: 'BrewTrax', accent_color: '#1d4ed8' })
    render(<BrandingClient {...baseProps} initialDefaultTerms="" />)
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'BrewTrax' } })
    fireEvent.click(screen.getByRole('button', { name: /save branding/i }))
    await waitFor(() => expect(updateOrgBranding).toHaveBeenCalledWith('o1', {
      display_name: 'BrewTrax',
      logo_url: '',
      cover_image_url: '',
      accent_color: '#1d4ed8',
      secondary_color: '',
    }))
    expect(await screen.findByText(/saved/i)).toBeTruthy()
  })

  it('surfaces a validation error from the action', async () => {
    updateOrgBranding.mockRejectedValue(new Error('accent_color must be a #rrggbb hex color'))
    render(<BrandingClient {...baseProps} initialDefaultTerms="" />)
    fireEvent.change(screen.getByLabelText(/accent color hex/i), { target: { value: '#zz0000' } })
    fireEvent.click(screen.getByRole('button', { name: /save branding/i }))
    expect(await screen.findByText(/#rrggbb/i)).toBeTruthy()
  })

  it('uploads a logo and shows the returned image', async () => {
    uploadOrgAsset.mockResolvedValue({ url: 'https://storage/logo.png' })
    render(<BrandingClient {...baseProps} initialDefaultTerms="" />)
    const input = screen.getByLabelText(/logo image/i)
    const png = new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [png] } })
    await waitFor(() => expect(uploadOrgAsset).toHaveBeenCalled())
    expect(uploadOrgAsset.mock.calls[0][0]).toBe('o1')
    expect(uploadOrgAsset.mock.calls[0][1]).toBe('logo')
    await waitFor(() => expect(screen.getByAltText(/logo image preview/i)).toHaveAttribute('src', 'https://storage/logo.png'))
  })
})
