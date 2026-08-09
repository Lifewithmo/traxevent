import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { ensureSpy } = vi.hoisted(() => ({
  ensureSpy: vi.fn().mockResolvedValue('portal_tok'),
}))
vi.mock('@/actions/client-portal', () => ({
  ensureClientPortalToken: ensureSpy,
}))

import { CopyPortalLinkButton } from '@/components/admin/opportunity/CopyPortalLinkButton'

beforeEach(() => vi.clearAllMocks())

describe('CopyPortalLinkButton', () => {
  it('mints the token, copies the link, and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<CopyPortalLinkButton orgId="o1" leadId="l1" />)
    fireEvent.click(screen.getByRole('button', { name: /portal link/i }))
    expect(await screen.findByText('Copied!')).toBeInTheDocument()
    expect(ensureSpy).toHaveBeenCalledWith('o1', 'l1')
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/client/portal_tok'))
  })

  it('surfaces an error when the token cannot be minted', async () => {
    ensureSpy.mockRejectedValueOnce(new Error('nope'))
    render(<CopyPortalLinkButton orgId="o1" leadId="l1" />)
    fireEvent.click(screen.getByRole('button', { name: /portal link/i }))
    expect(await screen.findByText('nope')).toBeInTheDocument()
  })
})
