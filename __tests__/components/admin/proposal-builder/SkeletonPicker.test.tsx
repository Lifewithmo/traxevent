import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SkeletonPicker } from '@/components/admin/proposal-builder/SkeletonPicker'

const createProposal = vi.fn()
const updateProposalDraft = vi.fn()
const push = vi.fn()

vi.mock('@/actions/proposals', () => ({
  createProposal: (...a: unknown[]) => createProposal(...a),
  updateProposalDraft: (...a: unknown[]) => updateProposalDraft(...a),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  createProposal.mockResolvedValue({ id: 'new-p' })
  updateProposalDraft.mockResolvedValue({ proposal: {}, adjustments: [] })
})

function mount() {
  render(
    <SkeletonPicker
      orgId="o1"
      orgSlug="acme"
      leadId="l1"
      title="BrewTrax — Miller wedding"
      contactName="Jordan Miller"
    />,
  )
}

describe('SkeletonPicker', () => {
  it('offers the three skeletons and Blank', () => {
    mount()
    expect(screen.getByRole('button', { name: /full proposal/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quick quote/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /visual showcase/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /blank/i })).toBeInTheDocument()
  })

  it('creates with the CRM-autofilled title, scaffolds the skeleton, and navigates', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /full proposal/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/acme/leads/l1/proposals/new-p'))
    expect(createProposal).toHaveBeenCalledWith('o1', 'l1', { title: 'BrewTrax — Miller wedding' })
    const [, , draft] = updateProposalDraft.mock.calls[0]
    // Full-state action: the title must ride along with the blocks, or the
    // save would clear the title createProposal just set.
    expect(draft.title).toBe('BrewTrax — Miller wedding')
    expect(draft.blocks.length).toBeGreaterThan(0)
    expect(draft.blocks.every((b: { placeholder?: boolean }) => b.placeholder === true)).toBe(true)
    const intro = draft.blocks.find((b: { type: string }) => b.type === 'paragraph')
    expect(intro.text).toContain('Jordan Miller')
  })

  it('Blank skips the scaffold write entirely', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /blank/i }))
    await waitFor(() => expect(push).toHaveBeenCalled())
    expect(updateProposalDraft).not.toHaveBeenCalled()
  })

  it('surfaces a create failure and re-enables the picker', async () => {
    createProposal.mockRejectedValueOnce(new Error('nope'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: /quick quote/i }))
    expect(await screen.findByText('nope')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quick quote/i })).toBeEnabled()
    expect(push).not.toHaveBeenCalled()
  })
})
