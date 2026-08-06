import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
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
})
