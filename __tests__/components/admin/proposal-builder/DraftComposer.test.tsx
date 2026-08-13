import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const generate = vi.fn()
const reset = vi.fn()
let mockState: unknown = { status: 'idle' }

vi.mock('@/components/admin/proposal-builder/useDraftStream', () => ({
  useDraftStream: () => ({ state: mockState, generate, reset }),
}))

import { DraftComposer } from '@/components/admin/proposal-builder/DraftComposer'

const DRAFT = {
  blocks: [
    { id: 'h1', type: 'heading', text: 'Our offer', level: 2 },
    { id: 'p1', type: 'paragraph', text: 'Drafted paragraph' },
  ],
  suggested_packages: [
    {
      id: 'ai-pkg-1',
      name: 'Coffee Cart',
      recommended: true,
      includes: [],
      price: 1200,
      item_ids: ['ai-1', 'ai-2'],
    },
  ],
  suggested_line_items: [
    { id: 'ai-1', description: 'Two baristas', quantity: 4, unit_price: 150 },
    { id: 'ai-2', description: 'Espresso bar', quantity: 1, unit_price: 600 },
  ],
  rationale: 'Because the notes mentioned coffee.',
  adjustments: ['Dropped a suggested package not in your catalog: "wp-ghost".'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockState = { status: 'idle' }
})

function mount(over: Partial<Parameters<typeof DraftComposer>[0]> = {}) {
  const props = {
    orgId: 'o1',
    proposalId: 'p1',
    placeholderCount: 2,
    hasBlocks: true,
    open: true,
    onOpenChange: vi.fn(),
    onApply: vi.fn(),
    variant: 'modal' as const,
    ...over,
  }
  render(<DraftComposer {...props} />)
  return props
}

describe('DraftComposer', () => {
  it('renders the textarea and disabled generate button when notes are empty', () => {
    mount()
    expect(screen.getByPlaceholderText('Paste call notes, an email thread, or a transcript…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate draft/i })).toBeDisabled()
  })

  it('enables generate once notes are typed and calls generate on click', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByPlaceholderText('Paste call notes, an email thread, or a transcript…'), 'client wants a coffee cart')
    const btn = screen.getByRole('button', { name: /generate draft/i })
    expect(btn).toBeEnabled()
    await user.click(btn)
    expect(generate).toHaveBeenCalledWith({ orgId: 'o1', proposalId: 'p1', notes: 'client wants a coffee cart' })
  })

  it('shows a live preview and writing indicator while streaming', () => {
    mockState = { status: 'streaming', previewBlocks: [{ id: 'h1', type: 'heading', text: 'Hi', level: 2 }] }
    mount()
    expect(screen.getByText('Hi')).toBeInTheDocument()
    expect(screen.getByText(/writing/i)).toBeInTheDocument()
  })

  it('shows the draft preview, rationale, suggested packages and adjustments when done', () => {
    mockState = { status: 'done', draft: DRAFT }
    mount()
    expect(screen.getByText('Drafted paragraph')).toBeInTheDocument()
    expect(screen.getByText(/because the notes mentioned coffee/i)).toBeInTheDocument()
    const suggestion = screen.getByText(/suggested: coffee cart/i)
    expect(suggestion).toHaveTextContent(/2 items/i)
    expect(suggestion).toHaveTextContent(/\$1,200/)
    expect(suggestion).toHaveTextContent(/recommended/i)
    expect(screen.getByText(/wp-ghost/)).toBeInTheDocument()
  })

  it('fill applies the draft blocks in fill mode', async () => {
    mockState = { status: 'done', draft: DRAFT }
    const user = userEvent.setup()
    const { onApply } = mount({ placeholderCount: 2, hasBlocks: true })
    await user.click(screen.getByRole('button', { name: /fill 2 placeholder sections/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'fill')
  })

  it('offers "Use draft" when there are no existing blocks', async () => {
    mockState = { status: 'done', draft: DRAFT }
    const user = userEvent.setup()
    const { onApply } = mount({ placeholderCount: 0, hasBlocks: false })
    await user.click(screen.getByRole('button', { name: /use draft/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'fill')
  })

  it('replace is confirm-gated', async () => {
    mockState = { status: 'done', draft: DRAFT }
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    const { onApply } = mount()
    await user.click(screen.getByRole('button', { name: /replace document/i }))
    expect(confirmSpy).toHaveBeenCalledWith('Replace the existing document with this draft? Hand-written sections will be lost.')
    expect(onApply).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: /replace document/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'replace')
    confirmSpy.mockRestore()
  })

  it('shows the error message in an alert', () => {
    mockState = { status: 'error', message: 'Draft too long — shorten your notes.' }
    mount()
    expect(screen.getByRole('alert')).toHaveTextContent(/shorten your notes/i)
  })

  it('modal variant wraps content in a dialog titled "Draft this proposal from your notes"', () => {
    mount({ variant: 'modal', open: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Draft this proposal from your notes')).toBeInTheDocument()
  })

  it('hero variant renders inline with heading and subtitle, no dialog', () => {
    mount({ variant: 'hero' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Draft this proposal from your notes')).toBeInTheDocument()
    expect(screen.getByText(/paste call notes, an email thread, or a transcript — you'll get a full draft with suggested packages\./i)).toBeInTheDocument()
  })
})
