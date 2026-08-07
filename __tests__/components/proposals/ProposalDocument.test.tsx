import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProposalDocument, ProposalBlockView } from '@/components/proposals/ProposalDocument'
import { ProposalThemeStub } from '@/components/proposals/ProposalThemeStub'
import type { PlaceholderBlock } from '@/lib/proposal-builder-stubs'
import type { ProposalBlock } from '@/lib/types'

describe('ProposalDocument', () => {
  it('renders nothing when there are no blocks', () => {
    const { container } = render(<ProposalDocument blocks={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when blocks is undefined', () => {
    const { container } = render(<ProposalDocument />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders each block type', () => {
    const blocks: ProposalBlock[] = [
      { id: '1', type: 'heading', text: 'Why us', level: 2 },
      { id: '2', type: 'paragraph', text: 'We are **great**' },
      { id: '3', type: 'list', items: ['Coffee', 'Cart'] },
      { id: '4', type: 'image', url: 'https://x/y.png', alt: 'Our cart', caption: 'On site' },
      { id: '5', type: 'testimonial', quote: 'Superb', attribution: 'Dana' },
    ]
    render(<ProposalDocument blocks={blocks} />)

    expect(screen.getByRole('heading', { name: 'Why us', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('great').tagName).toBe('STRONG')
    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Our cart' })).toHaveAttribute('src', 'https://x/y.png')
    expect(screen.getByText('On site')).toBeInTheDocument()
    expect(screen.getByText(/Superb/)).toBeInTheDocument()
    expect(screen.getByText(/Dana/)).toBeInTheDocument()
  })

  it('renders an ordered list as ol', () => {
    render(<ProposalDocument blocks={[{ id: '1', type: 'list', items: ['a'], ordered: true }]} />)
    expect(screen.getByRole('list').tagName).toBe('OL')
  })

  it('renders markup in text as literal characters, not html', () => {
    render(<ProposalDocument blocks={[
      { id: '1', type: 'paragraph', text: '<script>alert(1)</script>' },
    ]} />)
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })

  it('silently skips placeholder blocks by default (customer surfaces)', () => {
    const blocks: PlaceholderBlock[] = [
      { id: '1', type: 'paragraph', text: 'Real content' },
      { id: '2', type: 'paragraph', text: 'Replace this intro', placeholder: true },
    ]
    render(<ProposalDocument blocks={blocks} />)
    expect(screen.getByText('Real content')).toBeInTheDocument()
    expect(screen.queryByText('Replace this intro')).not.toBeInTheDocument()
  })

  it('renders nothing when every block is a placeholder', () => {
    const blocks: PlaceholderBlock[] = [
      { id: '1', type: 'paragraph', text: 'Replace me', placeholder: true },
    ]
    const { container } = render(<ProposalDocument blocks={blocks} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders placeholder blocks when showPlaceholders is set (builder canvas)', () => {
    const blocks: PlaceholderBlock[] = [
      { id: '1', type: 'paragraph', text: 'Replace this intro', placeholder: true },
    ]
    render(<ProposalDocument blocks={blocks} showPlaceholders />)
    expect(screen.getByText('Replace this intro')).toBeInTheDocument()
  })
})

describe('ProposalBlockView', () => {
  it('renders a single block standalone (reused by the builder canvas)', () => {
    render(<ProposalBlockView block={{ id: '1', type: 'heading', text: 'Solo', level: 3 }} />)
    expect(screen.getByRole('heading', { name: 'Solo', level: 3 })).toBeInTheDocument()
  })
})

describe('ProposalThemeStub', () => {
  it('sets accent variables from branding on the wrapper', () => {
    const { container } = render(
      <ProposalThemeStub branding={{ accent_color: '#123456' }}>
        <p>inside</p>
      </ProposalThemeStub>,
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.getPropertyValue('--proposal-accent')).toBe('#123456')
  })

  it('renders children with neutral defaults when branding is absent', () => {
    const { container } = render(
      <ProposalThemeStub>
        <p>inside</p>
      </ProposalThemeStub>,
    )
    expect(screen.getByText('inside')).toBeInTheDocument()
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.getPropertyValue('--proposal-accent')).not.toBe('')
  })
})
