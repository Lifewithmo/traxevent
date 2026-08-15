import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ProposalBuilderClient } from '@/components/admin/proposal-builder/ProposalBuilderClient'
import type { Proposal } from '@/lib/types'
import type { ProposalDraftUpdate } from '@/lib/proposals/draft'

const updateProposalDraft = vi.fn()
vi.mock('@/actions/proposals', () => ({
  updateProposalDraft: (...a: unknown[]) => updateProposalDraft(...a),
  sendProposal: vi.fn().mockResolvedValue(undefined),
  deleteProposal: vi.fn().mockResolvedValue(undefined),
  voidProposal: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/proposal-images', () => ({
  uploadProposalImage: vi.fn().mockResolvedValue({ url: 'https://storage/x.png' }),
}))
vi.mock('@/actions/proposal-templates', () => ({
  createProposalTemplate: vi.fn().mockResolvedValue({ id: 't-new' }),
}))
vi.mock('@/actions/proposal-ai', () => ({
  generateProposalDraft: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// Light prop-capturing stubs for the child components wired in Task 9 — the
// wiring is what this file asserts, not the children's own behavior (each has
// its own test file).
vi.mock('@/components/admin/proposal-builder/TopBar', () => ({
  TopBar: (props: Record<string, unknown>) => (
    <div data-testid="topbar">
      <span data-testid="topbar-status">{String(props.status)}</span>
      <span data-testid="topbar-placeholder-count">{String(props.placeholderCount)}</span>
      <button type="button" onClick={() => (props.onSend as () => void)?.()}>topbar-send</button>
      <button type="button" onClick={() => (props.onCopyLink as () => void)?.()}>topbar-copy-link</button>
      <button type="button" onClick={() => (props.onVoid as () => void)?.()}>topbar-void</button>
      <button type="button" onClick={() => (props.onDelete as () => void)?.()}>topbar-delete</button>
      <button type="button" onClick={() => (props.onOpenAi as (() => void) | undefined)?.()}>topbar-open-ai</button>
      <button type="button" onClick={() => (props.onPlaceholderChip as (() => void) | undefined)?.()}>
        topbar-placeholder-chip
      </button>
    </div>
  ),
}))

vi.mock('@/components/admin/proposal-builder/SendDialog', () => ({
  SendDialog: (props: Record<string, unknown>) =>
    props.open ? (
      <div data-testid="send-dialog">
        <span data-testid="send-dialog-sent">{String(props.sent)}</span>
        <button type="button" onClick={() => (props.onConfirmSend as () => void)?.()}>confirm-send</button>
        <button type="button" onClick={() => (props.onJumpToPlaceholders as () => void)?.()}>
          jump-to-placeholders
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/admin/proposal-builder/DraftComposer', () => ({
  DraftComposer: (props: Record<string, unknown>) =>
    props.variant === 'hero' ? (
      <div data-testid="hero-composer" />
    ) : props.open ? (
      <div data-testid="modal-composer" />
    ) : null,
}))

vi.mock('@/components/admin/proposal-builder/TotalsCanvas', () => ({
  TotalsCanvas: (props: Record<string, unknown>) => (
    <div data-testid="totals-canvas" data-disabled={String(props.disabled)} />
  ),
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
  // The real action returns the persisted Proposal; echoing the submitted
  // draft fields on a proposal-shaped object gives the hook the same re-seed.
  updateProposalDraft.mockImplementation(async (_o, _p, draft) => ({
    proposal: { ...makeProposal(), ...draft },
    adjustments: [],
  }))
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
  })

  it('re-seeds from what the server persisted, so a dropped block disappears', async () => {
    updateProposalDraft.mockImplementation(async (_o, _p, draft: ProposalDraftUpdate) => ({
      proposal: { ...makeProposal(), ...draft, blocks: draft.blocks!.slice(0, 1) },
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

describe('ProposalBuilderClient locked state', () => {
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
  })

  it('passes disabled: true to TotalsCanvas when the proposal has a signature', () => {
    mount(
      makeProposal({
        status: 'accepted',
        signature: {
          signer_name: 'Dana', signer_email: 'd@x.com', signed_at: '2026-08-02T00:00:00.000Z',
          ip: '1.1.1.1', user_agent: 'jsdom', consent_electronic: true, document_hash: 'abc',
        },
      }),
    )
    expect(screen.getByTestId('totals-canvas')).toHaveAttribute('data-disabled', 'true')
  })

  it('passes disabled: false to TotalsCanvas for an editable draft', () => {
    mount()
    expect(screen.getByTestId('totals-canvas')).toHaveAttribute('data-disabled', 'false')
  })

  it('renders the voided banner', () => {
    mount(makeProposal({ status: 'voided', void_reason: 'Client backed out' }))
    expect(screen.getByText(/client backed out/i)).toBeInTheDocument()
  })
})

describe('ProposalBuilderClient sticky "Client sees" bar', () => {
  it('renders unchanged alongside TotalsCanvas — always-visible-while-scrolling summary vs in-document totals', () => {
    mount(
      makeProposal({
        line_items: [{ id: 'i1', description: 'Thing', quantity: 1, unit_price: 500, taxable: false }],
        deposit: { type: 'percent', value: 50 },
      }),
    )
    expect(screen.getByText('Client sees: $500.00')).toBeInTheDocument()
    expect(screen.getByText(/Deposit: \$250\.00/)).toBeInTheDocument()
    // TotalsCanvas (the in-document editable totals) still renders too.
    expect(screen.getByTestId('totals-canvas')).toBeInTheDocument()
  })

  it('omits the deposit line when no deposit is set', () => {
    mount(makeProposal({ line_items: [{ id: 'i1', description: 'Thing', quantity: 1, unit_price: 500, taxable: false }] }))
    expect(screen.getByText('Client sees: $500.00')).toBeInTheDocument()
    expect(screen.queryByText(/^Deposit:/)).not.toBeInTheDocument()
  })
})

describe('ProposalBuilderClient hero composer', () => {
  it('shows the hero when AI is enabled and every block is a placeholder', () => {
    mount(
      makeProposal({
        blocks: [{ id: 'ph1', type: 'paragraph', text: 'Replace this intro', placeholder: true } as never],
      }),
      true,
    )
    expect(screen.getByTestId('hero-composer')).toBeInTheDocument()
  })

  it('shows the hero for an empty document when AI is enabled', () => {
    mount(makeProposal({ blocks: [] }), true)
    expect(screen.getByTestId('hero-composer')).toBeInTheDocument()
  })

  it('hides the hero once any real block exists', () => {
    mount(
      makeProposal({
        blocks: [{ id: 'h1', type: 'heading', text: 'Our offer', level: 2 }],
      }),
      true,
    )
    expect(screen.queryByTestId('hero-composer')).not.toBeInTheDocument()
  })

  it('hides the hero when AI is disabled', () => {
    mount(makeProposal(), false)
    expect(screen.queryByTestId('hero-composer')).not.toBeInTheDocument()
  })

  it('opens the modal composer from the topbar AI button', () => {
    mount(makeProposal({ blocks: [] }), true)
    expect(screen.queryByTestId('modal-composer')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('topbar-open-ai'))
    expect(screen.getByTestId('modal-composer')).toBeInTheDocument()
  })

  it('placeholder chip scrolls to the first placeholder AND opens the AI composer when AI is enabled', () => {
    mount(makeProposal(), true)
    const scrollSpy = vi.fn()
    const el = document.querySelector('[data-placeholder-block]') as HTMLElement | null
    if (el) el.scrollIntoView = scrollSpy
    expect(screen.queryByTestId('modal-composer')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('topbar-placeholder-chip'))
    if (el) expect(scrollSpy).toHaveBeenCalled()
    expect(screen.getByTestId('modal-composer')).toBeInTheDocument()
  })

  it('placeholder chip only scrolls (does not open the composer) when AI is disabled', () => {
    mount(makeProposal(), false)
    const scrollSpy = vi.fn()
    const el = document.querySelector('[data-placeholder-block]') as HTMLElement | null
    if (el) el.scrollIntoView = scrollSpy
    fireEvent.click(screen.getByText('topbar-placeholder-chip'))
    if (el) expect(scrollSpy).toHaveBeenCalled()
    expect(screen.queryByTestId('modal-composer')).not.toBeInTheDocument()
  })
})

describe('ProposalBuilderClient send flow', () => {
  it('opens SendDialog from the topbar onSend, without a window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    mount()
    expect(screen.queryByTestId('send-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('topbar-send'))
    expect(screen.getByTestId('send-dialog')).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('SendDialog confirm calls sendProposal and flips to sent', async () => {
    mount()
    fireEvent.click(screen.getByText('topbar-send'))
    expect(screen.getByTestId('send-dialog-sent')).toHaveTextContent('false')
    await act(async () => {
      fireEvent.click(screen.getByText('confirm-send'))
      await Promise.resolve()
    })
    expect(sendProposal).toHaveBeenCalledWith('o1', 'p1')
    expect(screen.getByTestId('send-dialog-sent')).toHaveTextContent('true')
    expect(screen.getByTestId('topbar-status')).toHaveTextContent('sent')
  })

  it('shows a flash message and stays unsent when sendProposal rejects', async () => {
    vi.mocked(sendProposal).mockRejectedValueOnce(new Error('network down'))
    mount()
    fireEvent.click(screen.getByText('topbar-send'))
    await act(async () => {
      fireEvent.click(screen.getByText('confirm-send'))
      await Promise.resolve()
    })
    expect(screen.getByRole('status')).toHaveTextContent('network down')
    expect(screen.getByTestId('send-dialog-sent')).toHaveTextContent('false')
    expect(screen.getByTestId('topbar-status')).toHaveTextContent('draft')
  })

  it('jumps to the first placeholder block from the dialog', () => {
    mount()
    fireEvent.click(screen.getByText('topbar-send'))
    const scrollSpy = vi.fn()
    const el = document.querySelector('[data-placeholder-block]') as HTMLElement | null
    if (el) el.scrollIntoView = scrollSpy
    fireEvent.click(screen.getByText('jump-to-placeholders'))
    if (el) expect(scrollSpy).toHaveBeenCalled()
  })
})

describe('ProposalBuilderClient link + destructive actions', () => {
  it('copies the client link and shows a flash confirmation', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    mount()
    await act(async () => {
      fireEvent.click(screen.getByText('topbar-copy-link'))
      await Promise.resolve()
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/proposals/tok-1`)
    expect(screen.getByRole('status')).toHaveTextContent(/link copied/i)
  })

  it('keeps window.prompt for void', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('No longer needed')
    mount(makeProposal({ status: 'sent' }))
    await act(async () => {
      fireEvent.click(screen.getByText('topbar-void'))
      await Promise.resolve()
    })
    expect(promptSpy).toHaveBeenCalled()
    expect(screen.getByTestId('topbar-status')).toHaveTextContent('voided')
    promptSpy.mockRestore()
  })

  it('keeps window.confirm for delete', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mount()
    fireEvent.click(screen.getByText('topbar-delete'))
    expect(confirmSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
