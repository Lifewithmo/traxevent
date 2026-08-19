import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProseSection } from '@/components/proposals/sections/ProseSection'

const blocks = [{ id: 'b1', type: 'paragraph' as const, text: 'Hello there' }]

describe('ProseSection', () => {
  it('renders its blocks', () => {
    render(<ProseSection blocks={blocks} treatment="plain" />)
    expect(screen.getByText('Hello there')).toBeInTheDocument()
  })

  it('constrains the measure so line length never runs long', () => {
    const { container } = render(<ProseSection blocks={blocks} treatment="plain" />)
    expect(container.querySelector('[data-measure]')?.className).toContain('max-w-[68ch]')
  })

  it('renders nothing when it has no visible blocks', () => {
    const { container } = render(<ProseSection blocks={[]} treatment="plain" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when every block is a placeholder', () => {
    const ph = [{ id: 'b1', type: 'paragraph' as const, text: 'TBD', placeholder: true }]
    const { container } = render(<ProseSection blocks={ph} treatment="plain" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows placeholders when the builder opts in', () => {
    const ph = [{ id: 'b1', type: 'paragraph' as const, text: 'TBD', placeholder: true }]
    render(<ProseSection blocks={ph} treatment="plain" showPlaceholders />)
    expect(screen.getByText('TBD')).toBeInTheDocument()
  })

  it('applies a tint only for the tinted treatment', () => {
    const { container: plain } = render(<ProseSection blocks={blocks} treatment="plain" />)
    const { container: tinted } = render(<ProseSection blocks={blocks} treatment="tinted" />)
    expect(plain.querySelector('section')!.className).not.toContain('--warm-50')
    expect(tinted.querySelector('section')!.className).toContain('--warm-50')
  })
})
