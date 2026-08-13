import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { NavIcon } from '@/components/layout/NavIcons'

describe('NavIcon', () => {
  it('renders a 16px stroke icon for a known name', () => {
    const { container } = render(<NavIcon name="pipeline" />)
    const svg = container.querySelector('svg')!
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('stroke-width')).toBe('1.3')
  })
  it('renders nothing for an unknown name', () => {
    // @ts-expect-error — runtime guard for bad names
    const { container } = render(<NavIcon name="nope" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
