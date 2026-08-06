import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProposalBlockEditor } from '@/components/admin/ProposalBlockEditor'

vi.mock('@/actions/proposals', () => ({
  updateProposalBlocks: vi.fn().mockResolvedValue({ adjustments: [] }),
}))
vi.mock('@/actions/proposal-images', () => ({
  uploadProposalImage: vi.fn().mockResolvedValue({ url: 'https://storage/x.png' }),
}))

import { updateProposalBlocks } from '@/actions/proposals'

const base = { orgId: 'o1', proposalId: 'p1' }

beforeEach(() => vi.clearAllMocks())

describe('ProposalBlockEditor', () => {
  it('shows an empty state when there are no blocks', () => {
    render(<ProposalBlockEditor {...base} initialBlocks={[]} />)
    expect(screen.getByText(/no content yet/i)).toBeInTheDocument()
  })

  it('adds a paragraph block', () => {
    render(<ProposalBlockEditor {...base} initialBlocks={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add paragraph' }))
    expect(screen.getByLabelText('Paragraph 1')).toBeInTheDocument()
  })

  it('edits a paragraph and saves', async () => {
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'Old' },
    ]} />)
    fireEvent.change(screen.getByLabelText('Paragraph 1'), { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(updateProposalBlocks).toHaveBeenCalledWith('o1', 'p1', [
      { id: 'a', type: 'paragraph', text: 'New' },
    ]))
  })

  it('moves a block down', () => {
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'First' },
      { id: 'b', type: 'paragraph', text: 'Second' },
    ]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])
    const areas = screen.getAllByRole('textbox') as HTMLTextAreaElement[]
    expect(areas[0].value).toBe('Second')
  })

  it('deletes a block after confirming', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'Bye' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete block' }))
    expect(screen.getByText(/no content yet/i)).toBeInTheDocument()
  })

  it('surfaces a save error', async () => {
    vi.mocked(updateProposalBlocks).mockRejectedValueOnce(new Error('nope'))
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'x' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument())
  })

  it('reports adjustments returned by the server', async () => {
    vi.mocked(updateProposalBlocks).mockResolvedValueOnce({ adjustments: ['Shortened a paragraph.'] })
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'x' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(screen.getByText(/Shortened a paragraph/)).toBeInTheDocument())
  })

  it('mints ids for new blocks that do not collide with ids persisted in an earlier session', async () => {
    // Simulates reopening the editor on a proposal that already has a
    // persisted block literally named "new-0" (normalizeBlocks keeps
    // client-supplied ids verbatim; it never rewrites them). A counter
    // that always restarts at 0 would mint a second "new-0" here.
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'new-0', type: 'paragraph', text: 'Existing' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add paragraph' }))

    // Distinct rendered rows: if React had reused a key across two blocks
    // sharing an id, one of these labels wouldn't resolve to its own node.
    const first = screen.getByLabelText('Paragraph 1')
    const second = screen.getByLabelText('Paragraph 2')
    expect(first).not.toBe(second)

    fireEvent.change(second, { target: { value: 'New one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))

    await waitFor(() => expect(updateProposalBlocks).toHaveBeenCalled())
    const [, , savedBlocks] = vi.mocked(updateProposalBlocks).mock.calls[0] as [string, string, { id: string }[]]
    const ids = savedBlocks.map((b) => b.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})
