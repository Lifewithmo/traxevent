import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PipelineStatTile } from '@/components/admin/pipeline/PipelineStatTile'
import { tileVariants } from '@/components/ui/stat-tile'
import { cn } from '@/lib/utils'

describe('PipelineStatTile', () => {
  // Anti-drift pin. This tile exists only to add noteTone + action; its shell
  // must stay the kit's, so it CONSUMES the kit's exported cva rather than
  // copying it. Re-copying the classes locally and editing them fails here.
  it.each(['default', 'money', 'alert'] as const)(
    'takes its %s container classes from the kit cva, never a local copy',
    (tone) => {
      const { container } = render(<PipelineStatTile label="Est. value" value="$1" tone={tone} />)
      const tile = container.querySelector('[data-slot="stat-tile"]') as HTMLElement
      expect(tile.className).toBe(cn(tileVariants({ tone })))
    }
  )

  it('renders the label, value and note', () => {
    render(<PipelineStatTile label="Est. value" value="$4,800" note="quoted" />)
    expect(screen.getByText('Est. value')).toBeInTheDocument()
    expect(screen.getByText('$4,800')).toBeInTheDocument()
    expect(screen.getByText('quoted')).toBeInTheDocument()
  })

  it('sets the figure in tabular numerals so tiles line up', () => {
    render(<PipelineStatTile label="Open balance" value="$1,200" />)
    expect(screen.getByText('$1,200').className).toContain('tabular-nums')
  })

  it('paints a money value with the money token, not a raw emerald literal', () => {
    render(<PipelineStatTile label="Est. value" value="$4,800" tone="money" />)
    const el = screen.getByText('$4,800')
    expect(el.className).toContain('var(--money-green)')
    expect(el.className).not.toContain('emerald')
  })

  it('paints an alert tile with the status-alert token and a destructive figure', () => {
    const { container } = render(<PipelineStatTile label="Open balance" value="$900" tone="alert" />)
    const tile = container.querySelector('[data-slot="stat-tile"]') as HTMLElement
    expect(tile.className).toContain('var(--status-alert-bg)')
    expect(tile.className).not.toContain('bg-red-')
    expect(screen.getByText('$900').className).toContain('text-destructive')
  })

  it('renders an alert note destructive, not muted — the kit tile cannot do this', () => {
    render(<PipelineStatTile label="Open balance" value="$900" note="past due" noteTone="alert" />)
    const note = screen.getByText('past due')
    expect(note.className).toContain('text-destructive')
    expect(note.className).not.toContain('text-muted-foreground')
  })

  it('renders a default note muted', () => {
    render(<PipelineStatTile label="Open balance" value="$900" note="not yet due" />)
    const note = screen.getByText('not yet due')
    expect(note.className).toContain('text-muted-foreground')
    expect(note.className).not.toContain('text-destructive')
  })

  it('renders an action in place of the note, and it is clickable', () => {
    const onClick = vi.fn()
    render(
      <PipelineStatTile
        label="Est. value"
        value="Not set"
        note="should not render"
        action={<button onClick={onClick}>+ Add value</button>}
      />
    )
    expect(screen.queryByText('should not render')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Add value' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('uses no raw Tailwind colour literals on the default tile', () => {
    const { container } = render(<PipelineStatTile label="Jobs" value="3" note="won / total" />)
    const html = container.innerHTML
    for (const raw of ['text-gray-', 'bg-white', 'bg-emerald-', 'text-red-', 'text-[var(--link)]']) {
      expect(html).not.toContain(raw)
    }
  })
})
