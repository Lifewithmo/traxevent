import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const generateProposalDraft = vi.fn()
vi.mock('@/actions/proposal-ai', () => ({
  generateProposalDraft: (...a: unknown[]) => generateProposalDraft(...a),
}))

import { ProposalAiPanel } from '@/components/admin/ProposalAiPanel'

const DRAFT = {
  blocks: [{ id: 'x1', type: 'paragraph', text: 'Drafted paragraph' }],
  suggested_package_ids: ['wp-a'],
  suggested_packages: [{ id: 'wp-a', name: 'Coffee Cart', price: 1200 }],
  rationale: 'Because the notes mentioned coffee.',
  adjustments: ['Dropped a suggested package not in your catalog: "wp-ghost".'],
}

beforeEach(() => {
  vi.clearAllMocks()
  generateProposalDraft.mockResolvedValue(DRAFT)
})

describe('ProposalAiPanel', () => {
  it('generates and shows the preview, rationale, suggestions, and adjustments', async () => {
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={false} disabled={false} onApply={vi.fn()} />)
    await user.type(screen.getByLabelText(/notes/i), 'client wants a coffee cart')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    expect(generateProposalDraft).toHaveBeenCalledWith('o1', 'p1', 'client wants a coffee cart')
    expect(await screen.findByText('Drafted paragraph')).toBeInTheDocument()
    expect(screen.getByText(/because the notes mentioned coffee/i)).toBeInTheDocument()
    expect(screen.getByText(/wp-ghost/)).toBeInTheDocument()
    expect(screen.getByText(/suggested: coffee cart \(\$1,200\)/i)).toBeInTheDocument()
  })

  it('marks the Generate button aria-busy while generating and the result region as a live region', async () => {
    let resolveDraft: (v: typeof DRAFT) => void = () => {}
    generateProposalDraft.mockReturnValueOnce(new Promise((r) => { resolveDraft = r }))
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={false} disabled={false} onApply={vi.fn()} />)
    await user.type(screen.getByLabelText(/notes/i), 'notes')
    const button = screen.getByRole('button', { name: /generate draft/i })
    expect(button).toHaveAttribute('aria-busy', 'false')
    await user.click(button)
    expect(button).toHaveAttribute('aria-busy', 'true')
    resolveDraft(DRAFT)
    await screen.findByText('Drafted paragraph')
    expect(button).toHaveAttribute('aria-busy', 'false')
    const region = screen.getByText('Drafted paragraph').closest('[aria-live="polite"]')
    expect(region).not.toBeNull()
  })

  it('offers Use draft when the proposal has no blocks', async () => {
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={false} disabled={false} onApply={onApply} />)
    await user.type(screen.getByLabelText(/notes/i), 'notes')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    await user.click(await screen.findByRole('button', { name: /use draft/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'use')
  })

  it('offers Append and confirm-gated Replace when blocks exist', async () => {
    const onApply = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={true} disabled={false} onApply={onApply} />)
    await user.type(screen.getByLabelText(/notes/i), 'notes')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    await user.click(await screen.findByRole('button', { name: /replace/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled() // confirm declined
    await user.click(screen.getByRole('button', { name: /append/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'append')
    confirmSpy.mockRestore()
  })

  it('replaces when the confirm dialog is accepted, and clears the preview', async () => {
    const onApply = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={true} disabled={false} onApply={onApply} />)
    await user.type(screen.getByLabelText(/notes/i), 'notes')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    await user.click(await screen.findByRole('button', { name: /replace/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'replace')
    expect(screen.queryByText('Drafted paragraph')).not.toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('shows action errors in an alert', async () => {
    generateProposalDraft.mockRejectedValue(new Error('Draft too long — shorten your notes.'))
    const user = userEvent.setup()
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={false} disabled={false} onApply={vi.fn()} />)
    await user.type(screen.getByLabelText(/notes/i), 'notes')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/shorten your notes/i)
  })

  it('disables everything when disabled (locked proposal)', () => {
    render(<ProposalAiPanel orgId="o1" proposalId="p1" hasBlocks={false} disabled={true} onApply={vi.fn()} />)
    expect(screen.getByLabelText(/notes/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /generate draft/i })).toBeDisabled()
  })
})
