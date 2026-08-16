import { render, screen } from '@testing-library/react'
import { Avatar } from '@/components/ui/avatar'

describe('Avatar', () => {
  it('renders up to two initials from the name', () => {
    render(<Avatar name="Marisol Vega" />)
    expect(screen.getByText('MV')).toBeInTheDocument()
  })
  it('is deterministic — same name yields the same background class', () => {
    const { container: a } = render(<Avatar name="Aiden Brooks" />)
    const { container: b } = render(<Avatar name="Aiden Brooks" />)
    expect(a.firstChild).toHaveClass(...Array.from((b.firstChild as HTMLElement).classList))
  })
})
