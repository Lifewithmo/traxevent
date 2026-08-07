import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const generateProposalDraft = vi.fn()
vi.mock('@/actions/proposal-ai', () => ({
  generateProposalDraft: (...a: unknown[]) => generateProposalDraft(...a),
}))

import { ProposalAiPanel } from '@/components/admin/proposal-builder/ProposalAiPanel'

const DRAFT = {
  blocks: [{ id: 'x1', type: 'paragraph', text: 'Drafted paragraph' }],
  suggested_package_ids: [],
  // v2 shape (spec §1): packages compose items. The panel renders name +
  // item count + summed price; the legacy {id,name,price} shape (still
  // returned until Track A lands) renders name + price.
  suggested_packages: [
    {
      name: 'Coffee Cart',
      recommended: true,
      items: [
        { description: 'Two baristas', quantity: 4, unit_price: 150 },
        { description: 'Espresso bar', quantity: 1, unit_price: 600 },
      ],
    },
  ],
  rationale: 'Because the notes mentioned coffee.',
  adjustments: ['Dropped a suggested package not in your catalog: "wp-ghost".'],
}

beforeEach(() => {
  vi.clearAllMocks()
  generateProposalDraft.mockResolvedValue(DRAFT)
})

function mount(over: Partial<Parameters<typeof ProposalAiPanel>[0]> = {}) {
  const props = {
    orgId: 'o1',
    proposalId: 'p1',
    placeholderCount: 2,
    hasBlocks: true,
    disabled: false,
    onApply: vi.fn(),
    ...over,
  }
  render(<ProposalAiPanel {...props} />)
  return props
}

async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/notes/i), 'client wants a coffee cart')
  await user.click(screen.getByRole('button', { name: /generate draft/i }))
  await screen.findByText('Drafted paragraph')
}

describe('ProposalAiPanel', () => {
  it('generates and previews the draft with rationale and adjustments', async () => {
    const user = userEvent.setup()
    mount()
    await generate(user)
    expect(generateProposalDraft).toHaveBeenCalledWith('o1', 'p1', 'client wants a coffee cart')
    expect(screen.getByText(/because the notes mentioned coffee/i)).toBeInTheDocument()
    expect(screen.getByText(/wp-ghost/)).toBeInTheDocument()
  })

  it('renders a v2 suggested package with item count and summed price', async () => {
    const user = userEvent.setup()
    mount()
    await generate(user)
    const suggestion = screen.getByText(/suggested: coffee cart/i)
    expect(suggestion).toHaveTextContent(/2 items/i)
    expect(suggestion).toHaveTextContent(/\$1,200/)
    expect(suggestion).toHaveTextContent(/recommended/i)
  })

  it('primary action fills placeholder sections', async () => {
    const user = userEvent.setup()
    const { onApply } = mount({ placeholderCount: 2 })
    await generate(user)
    await user.click(screen.getByRole('button', { name: /fill 2 placeholder sections/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'fill')
    expect(screen.queryByText('Drafted paragraph')).not.toBeInTheDocument()
  })

  it('offers fill on an empty document too (the draft becomes the document)', async () => {
    const user = userEvent.setup()
    const { onApply } = mount({ placeholderCount: 0, hasBlocks: false })
    await generate(user)
    await user.click(screen.getByRole('button', { name: /use draft/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'fill')
  })

  it('keeps full replace as a confirm-gated secondary action', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    const { onApply } = mount()
    await generate(user)
    await user.click(screen.getByRole('button', { name: /replace document/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: /replace document/i }))
    expect(onApply).toHaveBeenCalledWith(DRAFT.blocks, 'replace')
    confirmSpy.mockRestore()
  })

  it('shows action errors in an alert', async () => {
    generateProposalDraft.mockRejectedValue(new Error('Draft too long — shorten your notes.'))
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText(/notes/i), 'notes')
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/shorten your notes/i)
  })

  it('disables everything when disabled (locked proposal)', () => {
    mount({ disabled: true })
    expect(screen.getByLabelText(/notes/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /generate draft/i })).toBeDisabled()
  })
})
