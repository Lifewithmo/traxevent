import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RightRail } from '@/components/admin/proposal-builder/RightRail'
import type { Proposal } from '@/lib/types'

vi.mock('@/components/admin/proposal-builder/ProposalAiPanel', () => ({
  ProposalAiPanel: () => null,
}))

const proposal = {
  id: 'p1', org_id: 'o1', lead_id: 'l1', token: 't', status: 'draft',
  line_items: [], created_at: '2026-08-09T00:00:00.000Z',
} as Proposal

function renderRail(extra: { locked?: boolean; terms?: string; update?: (p: object) => void } = {}) {
  const update = extra.update ?? vi.fn()
  render(
    <RightRail
      proposal={proposal}
      status="draft"
      locked={extra.locked ?? false}
      draft={{ terms: extra.terms }}
      update={update}
      saveStatus="saved"
      adjustments={[]}
      retryNow={() => {}}
      placeholderCount={0}
      aiEnabled={false}
      busy={false}
      error={null}
      onSend={() => {}}
      onVoid={() => {}}
      onDelete={() => {}}
      onAiApply={() => {}}
    />,
  )
  return update
}

describe('RightRail terms', () => {
  it('edits terms through the autosave update callback', () => {
    const update = renderRail({ terms: 'Old.' })
    const box = screen.getByLabelText('Terms')
    expect(box).toHaveValue('Old.')
    fireEvent.change(box, { target: { value: 'New terms.' } })
    expect(update).toHaveBeenCalledWith({ terms: 'New terms.' })
  })

  it('clears terms as undefined (full-state autosave semantics)', () => {
    const update = renderRail({ terms: 'Old.' })
    fireEvent.change(screen.getByLabelText('Terms'), { target: { value: '' } })
    expect(update).toHaveBeenCalledWith({ terms: undefined })
  })

  it('disables the textarea when locked', () => {
    renderRail({ locked: true, terms: 'Old.' })
    expect(screen.getByLabelText('Terms')).toBeDisabled()
  })
})
