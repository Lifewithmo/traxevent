import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProposalComposition } from '@/components/proposals/ProposalComposition'

const legacy = {
  title: 'Launch Party',
  line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
  blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'Legacy body' }],
  terms: 'Legal text',
}

describe('ProposalComposition', () => {
  it('renders a legacy proposal with no sections field', () => {
    render(<ProposalComposition proposal={legacy} renderDerived={() => null} />)
    expect(screen.getByText('Legacy body')).toBeInTheDocument()
  })

  it('asks the host to render each derived section, in order', () => {
    const renderDerived = vi.fn().mockReturnValue(null)
    render(<ProposalComposition proposal={legacy} renderDerived={renderDerived} />)
    const types = renderDerived.mock.calls.map((c) => c[0])
    expect(types).toContain('investment')
    expect(types).toContain('accept')
    expect(types.indexOf('terms')).toBeGreaterThan(types.indexOf('accept'))
  })

  it('renders a cover section when branding supplies one', () => {
    render(
      <ProposalComposition
        proposal={{ ...legacy, sections: [{ id: 's1', type: 'cover' as const }] }}
        branding={{ logo_url: 'https://x/l.png' }}
        renderDerived={() => null}
      />,
    )
    expect(screen.getByTestId('proposal-cover')).toBeInTheDocument()
  })

  it('passes a treatment to every derived section it asks for', () => {
    const renderDerived = vi.fn().mockReturnValue(null)
    render(<ProposalComposition proposal={legacy} renderDerived={renderDerived} />)
    for (const call of renderDerived.mock.calls) {
      expect(['plain', 'tinted', 'bleed']).toContain(call[1])
    }
  })

  // Requirement (B): an empty non-derived section must not consume an
  // alternation slot in sectionTreatments, or two adjacent content bands
  // both render `tinted` — the "absence that looks like absence" failure
  // the absence rule (spec §15.1) exists to prevent.
  it('does not let an empty prose section between two content sections break the plain/tinted alternation', () => {
    const proposal = {
      title: 'Launch Party',
      line_items: [],
      sections: [
        { id: 's1', type: 'prose' as const, blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'First content' }] },
        { id: 's2', type: 'prose' as const, blocks: [{ id: 'b2', type: 'paragraph' as const, text: 'Empty', placeholder: true as const }] },
        { id: 's3', type: 'prose' as const, blocks: [{ id: 'b3', type: 'paragraph' as const, text: 'Second content' }] },
      ],
    }
    const { container } = render(<ProposalComposition proposal={proposal} renderDerived={() => null} />)
    const bands = Array.from(container.querySelectorAll('[data-measure]')).map(
      (el) => el.parentElement,
    )
    expect(bands).toHaveLength(2)
    // Without the filter, the empty section eats an alternation slot and both
    // visible bands come out with the SAME treatment (both `plain`) instead
    // of alternating — two adjacent identical bands.
    const tinted = bands.map((b) => b?.className.includes('bg-[var(--warm-50)]'))
    expect(tinted[0]).not.toBe(tinted[1])
  })

  // Widened (B): a section-level `placeholder: true` also renders nothing
  // (per its type comment, silently skipped on public/print) and must not
  // consume a slot either — unless showPlaceholders is set.
  it('does not let a placeholder-flagged section break the alternation', () => {
    const proposal = {
      title: 'Launch Party',
      line_items: [],
      sections: [
        { id: 'a', type: 'letter' as const, blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'First content' }] },
        { id: 'b', type: 'letter' as const, placeholder: true as const, blocks: [{ id: 'b2', type: 'paragraph' as const, text: 'Skeleton' }] },
        { id: 'c', type: 'menu' as const, blocks: [{ id: 'b3', type: 'paragraph' as const, text: 'Second content' }] },
      ],
    }
    const { container } = render(<ProposalComposition proposal={proposal} renderDerived={() => null} />)
    const bands = Array.from(container.querySelectorAll('[data-measure]')).map(
      (el) => el.parentElement,
    )
    expect(bands).toHaveLength(2)
    const tinted = bands.map((b) => b?.className.includes('bg-[var(--warm-50)]'))
    expect(tinted[0]).not.toBe(tinted[1])
  })

  // Widened (B): an authored section with no `blocks` key at all (normalizeSections
  // keeps the entry, drops only `blocks`) also renders nothing and must not
  // consume a slot.
  it('does not let a blocks-less section break the alternation', () => {
    const proposal = {
      title: 'Launch Party',
      line_items: [],
      sections: [
        { id: 'a', type: 'letter' as const, blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'First content' }] },
        { id: 'b', type: 'letter' as const },
        { id: 'c', type: 'menu' as const, blocks: [{ id: 'b3', type: 'paragraph' as const, text: 'Second content' }] },
      ],
    }
    const { container } = render(<ProposalComposition proposal={proposal} renderDerived={() => null} />)
    const bands = Array.from(container.querySelectorAll('[data-measure]')).map(
      (el) => el.parentElement,
    )
    expect(bands).toHaveLength(2)
    const tinted = bands.map((b) => b?.className.includes('bg-[var(--warm-50)]'))
    expect(tinted[0]).not.toBe(tinted[1])
  })
})
