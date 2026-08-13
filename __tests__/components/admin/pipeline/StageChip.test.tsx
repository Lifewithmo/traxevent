import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StageChip } from '@/components/admin/pipeline/StageChip'

describe('StageChip', () => {
  it('opens the menu and reports a stage selection', () => {
    const onStage = vi.fn()
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={onStage} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Consultation' }))
    expect(onStage).toHaveBeenCalledWith('consultation')
  })

  it('offers Mark lost as a distinct destructive action', () => {
    const onMarkLost = vi.fn()
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={onMarkLost} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark lost' }))
    expect(onMarkLost).toHaveBeenCalled()
  })

  it('closes the menu after selecting a stage', () => {
    const onStage = vi.fn()
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={onStage} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Consultation' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu after Mark lost', () => {
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark lost' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('sets an aria-label including the stage label and context', () => {
    render(<StageChip stage="proposal" ariaContext="Smith wedding" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Stage: Proposal. Change stage for Smith wedding.' })
    ).toBeInTheDocument()
  })

  it('renders menu items for open stages plus closed_won and a destructive Mark lost', () => {
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    const menu = screen.getByRole('menu')
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(items).toEqual(['Inquiry', 'Consultation', 'Proposal', 'Closed Won', 'Mark lost'])
    expect(menu).toBeInTheDocument()
  })
})
