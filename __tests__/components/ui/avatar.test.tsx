import { render, screen } from '@testing-library/react'
import { Avatar } from '@/components/ui/avatar'

describe('Avatar', () => {
  it('renders up to two initials from the name', () => {
    render(<Avatar name="Marisol Vega" />)
    expect(screen.getByText('MV')).toBeInTheDocument()
  })
  it('is deterministic — same name yields the same background color', () => {
    const { container: a } = render(<Avatar name="Aiden Brooks" />)
    const { container: b } = render(<Avatar name="Aiden Brooks" />)
    const aStyle = (a.firstChild as HTMLElement).style.backgroundColor
    const bStyle = (b.firstChild as HTMLElement).style.backgroundColor
    expect(aStyle).toBeTruthy()
    expect(aStyle).toBe(bStyle)
  })
})
