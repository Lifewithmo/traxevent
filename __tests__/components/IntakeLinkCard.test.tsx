import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { ensureSpy, regenSpy } = vi.hoisted(() => ({
  ensureSpy: vi.fn().mockResolvedValue('tok_aaa'),
  regenSpy: vi.fn().mockResolvedValue('tok_bbb'),
}))
vi.mock('@/actions/intake', () => ({
  ensureIntakeToken: ensureSpy,
  regenerateIntakeToken: regenSpy,
}))

import { IntakeLinkCard } from '@/components/admin/pipeline/IntakeLinkCard'

beforeEach(() => vi.clearAllMocks())

describe('IntakeLinkCard', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<IntakeLinkCard orgId="o1" open={false} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    expect(ensureSpy).not.toHaveBeenCalled()
  })

  it('mints (or fetches) the token on open and shows the URL', async () => {
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    expect(await screen.findByText(/\/inquire\/tok_aaa/)).toBeInTheDocument()
    expect(ensureSpy).toHaveBeenCalledWith('o1')
  })

  it('regenerate requires a confirm, then swaps the URL', async () => {
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    await screen.findByText(/tok_aaa/)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(regenSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/current link will stop working/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, regenerate' }))
    expect(await screen.findByText(/\/inquire\/tok_bbb/)).toBeInTheDocument()
    expect(regenSpy).toHaveBeenCalledWith('o1')
  })

  it('copies the URL to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    await screen.findByText(/tok_aaa/)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/inquire/tok_aaa'))
  })
})
