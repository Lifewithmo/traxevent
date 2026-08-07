import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProposalBlockEditor } from '@/components/admin/ProposalBlockEditor'

vi.mock('@/actions/proposals', () => ({
  updateProposalBlocks: vi.fn().mockResolvedValue({ adjustments: [] }),
}))
vi.mock('@/actions/proposal-images', () => ({
  uploadProposalImage: vi.fn().mockResolvedValue({ url: 'https://storage/x.png' }),
}))
vi.mock('@/actions/proposal-ai', () => ({ generateProposalDraft: vi.fn() }))

import { updateProposalBlocks } from '@/actions/proposals'
import { uploadProposalImage } from '@/actions/proposal-images'
import { generateProposalDraft } from '@/actions/proposal-ai'
import type { ProposalBlock } from '@/lib/types'

const base = { orgId: 'o1', proposalId: 'p1' }

// The action now echoes back what it persisted. Default the mock to "kept
// everything" so the existing cases keep exercising the unchanged path.
function echo(blocks: ProposalBlock[], adjustments: string[] = []) {
  return { blocks, adjustments }
}

function savedBlocksFromCall(call = 0): ProposalBlock[] {
  return vi.mocked(updateProposalBlocks).mock.calls[call][2] as ProposalBlock[]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateProposalBlocks).mockImplementation(
    async (_o: string, _p: string, blocks: unknown) => echo(blocks as ProposalBlock[]),
  )
})

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
    vi.mocked(updateProposalBlocks).mockResolvedValueOnce(
      echo([{ id: 'a', type: 'paragraph', text: 'x' }], ['Shortened a paragraph.']),
    )
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'x' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(screen.getByText(/Shortened a paragraph/)).toBeInTheDocument())
  })

  it('re-seeds from the blocks the server persisted so a dropped block cannot linger', async () => {
    // A half-filled block is dropped by normalizeBlocks WITHOUT an adjustment.
    // Before the fix the UI printed "Saved." and kept rendering all three,
    // and the third only vanished on a later reload.
    vi.mocked(updateProposalBlocks).mockResolvedValueOnce(
      echo([
        { id: 'a', type: 'paragraph', text: 'One' },
        { id: 'b', type: 'paragraph', text: 'Two' },
      ]),
    )
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'One' },
      { id: 'b', type: 'paragraph', text: 'Two' },
      { id: 'c', type: 'paragraph', text: '' },
    ]} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))

    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2))
    // …and it is never reported as a clean "Saved."
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
    expect(screen.getByText(/removed 1 incomplete block/i)).toBeInTheDocument()
  })

  it('still says Saved. when the server kept every block', async () => {
    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'One' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument())
  })

  it('lands an uploaded image url on its own block after an intervening reorder', async () => {
    // pickImage awaits the upload, so anything index-based resolves against a
    // stale position: move the image down mid-upload and the url used to be
    // written onto whatever block had taken index 0.
    let resolveUpload: (v: { url: string }) => void = () => {}
    vi.mocked(uploadProposalImage).mockReturnValueOnce(
      new Promise((r) => { resolveUpload = r }),
    )

    render(<ProposalBlockEditor {...base} initialBlocks={[
      { id: 'img', type: 'image', url: '' },
      { id: 'para', type: 'paragraph', text: 'Body' },
    ]} />)

    fireEvent.change(screen.getByLabelText('Image 1'), {
      target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] },
    })
    // Reorder while the upload is still in flight.
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])

    resolveUpload({ url: 'https://storage/x.png' })
    await waitFor(() => expect(screen.getByText('https://storage/x.png')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(updateProposalBlocks).toHaveBeenCalled())
    const saved = savedBlocksFromCall()
    const image = saved.find((b) => b.id === 'img') as { url: string }
    const paragraph = saved.find((b) => b.id === 'para') as Record<string, unknown>
    expect(image.url).toBe('https://storage/x.png')
    expect(paragraph.url).toBeUndefined()
  })

  it('disables every control when the proposal is locked', () => {
    render(<ProposalBlockEditor {...base} disabled initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'Locked' },
    ]} />)
    expect(screen.getByLabelText('Paragraph 1')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete block' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add paragraph' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save document' })).toBeDisabled()
  })

  it('does not save a locked document even if save is invoked', () => {
    render(<ProposalBlockEditor {...base} disabled initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'Locked' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    expect(updateProposalBlocks).not.toHaveBeenCalled()
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

  it('appends re-minted AI-drafted blocks, retaining prior blocks and stripping model-supplied ids', async () => {
    vi.mocked(generateProposalDraft).mockResolvedValue({
      blocks: [
        { id: 'model-id-1', type: 'paragraph', text: 'Drafted paragraph' },
        { id: 'model-id-2', type: 'heading', text: 'Drafted heading', level: 2 },
      ],
      suggested_packages: [],
      suggested_line_items: [],
      rationale: '',
      adjustments: [],
    })

    const user = userEvent.setup()
    render(<ProposalBlockEditor {...base} aiEnabled initialBlocks={[
      { id: 'a', type: 'paragraph', text: 'Existing' },
    ]} />)

    await user.type(screen.getByLabelText(/notes for ai draft/i), 'client wants a coffee cart')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    await user.click(await screen.findByRole('button', { name: /append/i }))

    // Prior block retained.
    expect(screen.getByLabelText('Paragraph 1')).toHaveValue('Existing')
    // New blocks present.
    expect(screen.getByLabelText('Paragraph 2')).toHaveValue('Drafted paragraph')
    expect(screen.getByLabelText('Heading 3')).toHaveValue('Drafted heading')

    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))
    await waitFor(() => expect(updateProposalBlocks).toHaveBeenCalled())
    const saved = savedBlocksFromCall()
    expect(saved).toHaveLength(3)
    expect(saved[0].id).toBe('a')
    // No applied (AI-drafted) block keeps a model-supplied id — each was
    // re-minted through the editor's own counter.
    const appliedIds = saved.slice(1).map((b) => b.id)
    for (const id of appliedIds) {
      expect(id).toMatch(/^new-\d+$/)
    }
    expect(new Set(appliedIds).size).toBe(2)
  })
})
