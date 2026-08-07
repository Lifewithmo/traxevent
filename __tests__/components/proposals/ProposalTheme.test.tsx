import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  ProposalTheme,
  proposalThemeVars,
  DEFAULT_ACCENT,
  DEFAULT_SECONDARY,
} from '@/components/proposals/ProposalTheme'
import { contrastRatio } from '@/lib/branding'

describe('proposalThemeVars', () => {
  it('maps branding colors to the proposal CSS variables', () => {
    const vars = proposalThemeVars({ accent_color: '#1d4ed8', secondary_color: '#4b5563' })
    expect(vars['--proposal-accent']).toBe('#1d4ed8')
    expect(vars['--proposal-accent-text']).toBe('#ffffff')
    expect(vars['--proposal-accent-ink']).toBe('#1d4ed8') // already AA on white
    expect(vars['--proposal-secondary']).toBe('#4b5563')
  })

  it('falls back to the neutral theme when branding is absent', () => {
    const vars = proposalThemeVars(undefined)
    expect(vars['--proposal-accent']).toBe(DEFAULT_ACCENT)
    expect(vars['--proposal-secondary']).toBe(DEFAULT_SECONDARY)
  })

  it('clamps a low-contrast accent for ink use but keeps the raw accent for surfaces', () => {
    const vars = proposalThemeVars({ accent_color: '#ff0000' })
    expect(vars['--proposal-accent']).toBe('#ff0000')
    expect(vars['--proposal-accent-ink']).not.toBe('#ff0000')
    expect(contrastRatio(vars['--proposal-accent-ink'], '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('derives readable on-accent text for light accents', () => {
    expect(proposalThemeVars({ accent_color: '#ffff00' })['--proposal-accent-text']).toBe('#111827')
  })
})

describe('ProposalTheme', () => {
  it('renders children inside a wrapper carrying the variables', () => {
    const { container, getByText } = render(
      <ProposalTheme branding={{ accent_color: '#1d4ed8' }}>
        <p>doc</p>
      </ProposalTheme>
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(getByText('doc')).toBeTruthy()
    expect(wrapper.style.getPropertyValue('--proposal-accent')).toBe('#1d4ed8')
    expect(wrapper.style.getPropertyValue('--proposal-accent-text')).toBe('#ffffff')
  })

  it('merges a passed className onto the wrapper', () => {
    const { container } = render(
      <ProposalTheme className="print-root"><span>x</span></ProposalTheme>
    )
    expect((container.firstElementChild as HTMLElement).className).toContain('print-root')
  })
})
