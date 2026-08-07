import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { ProposalBuilderClient } from '@/components/admin/proposal-builder/ProposalBuilderClient'
import type { Proposal } from '@/lib/types'
import type { ProposalDraftUpdate } from '@/lib/proposal-builder-stubs'

const updateProposalDraft = vi.fn()
vi.mock('@/actions/proposal-builder-stubs', () => ({
  updateProposalDraft: (...a: unknown[]) => updateProposalDraft(...a),
}))
vi.mock('@/actions/proposals', () => ({
  sendProposal: vi.fn().mockResolvedValue(undefined),
  deleteProposal: vi.fn().mockResolvedValue(undefined),
  voidProposal: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/proposal-images', () => ({
  uploadProposalImage: vi.fn().mockResolvedValue({ url: 'https://storage/x.png' }),
}))
vi.mock('@/actions/proposal-ai', () => ({
  generateProposalDraft: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { sendProposal } from '@/actions/proposals'

function makeProposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: 'p1',
    org_id: 'o1',
    lead_id: 'l1',
    token: 'tok-1',
    status: 'draft',
    line_items: [],
    created_at: '2026-08-01T00:00:00.000Z',
    blocks: [
      { id: 'h1', type: 'heading', text: 'Our offer', level: 2 },
      { id: 'ph1', type: 'paragraph', text: 'Replace this intro', placeholder: true } as never,
      { id: 'ph2', type: 'paragraph', text: 'Replace the terms', placeholder: true } as never,
    ],
    ...over,
  }
}

function mount(proposal = makeProposal(), aiEnabled = false) {
  return render(
    <ProposalBuilderClient
      orgId="o1"
      orgSlug="acme"
      leadId="l1"
      proposal={proposal}
      aiEnabled={aiEnabled}
    />,
  )
}

function lastDraft(): ProposalDraftUpdate {
  return updateProposalDraft.mock.calls.at(-1)![2] as ProposalDraftUpdate
}

beforeEach(() => {
  vi.useFakeTimers()
  updateProposalDraft.mockImplementation(async (_o, _p, draft) => ({ draft, adjustments: [] }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

async function flushAutosave() {
  await act(async () => {
    vi.advanceTimersByTime(900)
    await Promise.resolve()
  })
}

describe('ProposalBuilderClient autosave', () => {
  it('debounces a burst of edits into one consolidated save', async () => {
    mount()
    fireEvent.click(screen.getByText('Our offer'))
    const box = screen.getByRole('textbox', { name: /heading/i })
    fireEvent.change(box, { target: { value: 'Better offer' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    fireEvent.click(screen.getByText('Replace this intro'))
    const para = screen.getByRole('textbox', { name: /paragraph/i })
    fireEvent.change(para, { target: { value: 'A real intro' } })
    fireEvent.keyDown(para, { key: 'Enter' })

    expect(updateProposalDraft).not.toHaveBeenCalled()
    await flushAutosave()
    expect(updateProposalDraft).toHaveBeenCalledTimes(1)
    const draft = lastDraft()
    expect(draft.blocks?.[0]).toMatchObject({ text: 'Better offer' })
    expect(draft.blocks?.[1]).toMatchObject({ text: 'A real intro' })
    expect(screen.getByText(/^saved$/i)).toBeInTheDocument()
  })

  it('re-seeds from what the server persisted, so a dropped block disappears', async () => {
    updateProposalDraft.mockImplementation(async (_o, _p, draft: ProposalDraftUpdate) => ({
      draft: { ...draft, blocks: draft.blocks!.slice(0, 1) },
      adjustments: ['Dropped an incomplete block.'],
    }))
    mount()
    fireEvent.click(screen.getByText('Our offer'))
    const box = screen.getByRole('textbox', { name: /heading/i })
    fireEvent.change(box, { target: { value: 'Edited' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await flushAutosave()
    expect(screen.queryByText('Replace this intro')).not.toBeInTheDocument()
    expect(screen.getByText(/dropped an incomplete block/i)).toBeInTheDocument()
  })

  it('shows Retrying with a manual retry when the save fails, keeping edits', async () => {
    updateProposalDraft.mockRejectedValueOnce(new Error('offline'))
    mount()
    fireEvent.click(screen.getByText('Our offer'))
    const box = screen.getByRole('textbox', { name: /heading/i })
    fireEvent.change(box, { target: { value: 'Edited while offline' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await flushAutosave()
    expect(screen.getByText(/retrying/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /retry now/i }))
    await flushAutosave()
    expect(updateProposalDraft).toHaveBeenCalledTimes(2)
    expect(lastDraft().blocks?.[0]).toMatchObject({ text: 'Edited while offline' })
    expect(screen.getByText(/^saved$/i)).toBeInTheDocument()
  })

  it('upgrades legacy packages on load and persists them on the first autosave', async () => {
    mount(
      makeProposal({
        packages: [{ id: 'lg', name: 'Classic', includes: ['A thing'], price: 500 }],
      }),
    )
    await flushAutosave()
    expect(updateProposalDraft).toHaveBeenCalledTimes(1)
    const pkg = lastDraft().packages![0]
    expect(pkg.item_ids).toHaveLength(1)
    expect(pkg.price_override).toBe(500)
  })

  it('never autosaves an unedited non-legacy proposal', async () => {
    mount()
    await flushAutosave()
    expect(updateProposalDraft).not.toHaveBeenCalled()
  })
})

describe('ProposalBuilderClient locked & rail', () => {
  it('renders a signed proposal fully read-only and never writes', async () => {
    mount(
      makeProposal({
        status: 'accepted',
        packages: [{ id: 'lg', name: 'Classic', includes: ['A thing'], price: 500 }],
        signature: {
          signer_name: 'Dana', signer_email: 'd@x.com', signed_at: '2026-08-02T00:00:00.000Z',
          ip: '1.1.1.1', user_agent: 'jsdom', consent_electronic: true, document_hash: 'abc',
        },
      }),
    )
    expect(screen.getByText(/signed and locked/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Our offer'))
    expect(screen.queryByRole('textbox', { name: /heading/i })).not.toBeInTheDocument()
    await flushAutosave()
    expect(updateProposalDraft).not.toHaveBeenCalled()
    // Void stays available on signed proposals.
    expect(screen.getByRole('button', { name: /void/i })).toBeInTheDocument()
  })

  it('shows the completeness count and the client link even for drafts', () => {
    mount()
    expect(screen.getByText(/2 placeholder sections remaining/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/\/proposals\/tok-1$/)).toBeInTheDocument()
  })

  it('warns before sending while placeholders remain', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount()
    fireEvent.click(screen.getByRole('button', { name: /send to client/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(sendProposal).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /send to client/i }))
    await act(async () => { await Promise.resolve() })
    expect(sendProposal).toHaveBeenCalledWith('o1', 'p1')
    confirmSpy.mockRestore()
  })

  it('links to the print view', () => {
    mount()
    const link = screen.getByRole('link', { name: /open print view/i })
    expect(link).toHaveAttribute('href', '/proposals/tok-1/print')
  })

  it('edits pricing terms in the rail and includes them in the consolidated save', async () => {
    mount()
    const rail = screen.getByTestId('builder-rail')
    fireEvent.change(within(rail).getByLabelText(/tax rate/i), { target: { value: '8.25' } })
    await flushAutosave()
    expect(lastDraft().tax_rate).toBe(8.25)
  })
})
