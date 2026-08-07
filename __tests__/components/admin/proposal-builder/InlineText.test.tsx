import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InlineText } from '@/components/admin/proposal-builder/InlineText'

describe('InlineText', () => {
  it('renders the committed value statically until clicked', () => {
    render(<InlineText value="Hello" onCommit={vi.fn()} ariaLabel="Title" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('click swaps to an editable field seeded with the raw value', () => {
    render(<InlineText value="Hello" onCommit={vi.fn()} ariaLabel="Title" />)
    fireEvent.click(screen.getByText('Hello'))
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Hello')
  })

  it('Enter commits the new value and restores the static view', () => {
    const onCommit = vi.fn()
    render(<InlineText value="Hello" onCommit={onCommit} ariaLabel="Title" />)
    fireEvent.click(screen.getByText('Hello'))
    const box = screen.getByRole('textbox', { name: 'Title' })
    fireEvent.change(box, { target: { value: 'New title' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('New title')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('Escape cancels without committing', () => {
    const onCommit = vi.fn()
    render(<InlineText value="Hello" onCommit={onCommit} ariaLabel="Title" />)
    fireEvent.click(screen.getByText('Hello'))
    const box = screen.getByRole('textbox', { name: 'Title' })
    fireEvent.change(box, { target: { value: 'Abandoned' } })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('blur commits', () => {
    const onCommit = vi.fn()
    render(<InlineText value="Hello" onCommit={onCommit} ariaLabel="Title" />)
    fireEvent.click(screen.getByText('Hello'))
    const box = screen.getByRole('textbox', { name: 'Title' })
    fireEvent.change(box, { target: { value: 'Blurred' } })
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenCalledWith('Blurred')
  })

  it('renders **bold** syntax as strong in the static view', () => {
    render(<InlineText value="Very **bold** words" onCommit={vi.fn()} ariaLabel="Body" />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('Shift+Enter inserts a newline instead of committing when multiline', () => {
    const onCommit = vi.fn()
    render(<InlineText value="Line" onCommit={onCommit} ariaLabel="Body" multiline />)
    fireEvent.click(screen.getByText('Line'))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('shows the placeholder when the value is empty', () => {
    render(<InlineText value="" onCommit={vi.fn()} ariaLabel="Title" placeholder="Add a title" />)
    expect(screen.getByText('Add a title')).toBeInTheDocument()
  })

  it('does nothing on click when disabled', () => {
    render(<InlineText value="Hello" onCommit={vi.fn()} ariaLabel="Title" disabled />)
    fireEvent.click(screen.getByText('Hello'))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('is keyboard-reachable: Enter on the focused static view starts editing', () => {
    render(<InlineText value="Hello" onCommit={vi.fn()} ariaLabel="Title" />)
    const staticView = screen.getByText('Hello').closest('[tabindex]') as HTMLElement
    fireEvent.keyDown(staticView, { key: 'Enter' })
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument()
  })
})
