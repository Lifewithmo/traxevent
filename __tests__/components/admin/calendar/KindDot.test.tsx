import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KindDot, KindLegend } from '@/components/admin/calendar/KindDot'
import { KIND_DOT, KIND_SHAPE } from '@/components/admin/calendar/kind-color'
import { CALENDAR_KINDS, CALENDAR_KIND_LABELS } from '@/lib/calendar'

/**
 * WCAG 1.4.1 (Use of Colour). Before this component the grids drew a bare
 * `<span className="size-1.5 rounded-full" style={{background: token}} aria-hidden/>`
 * — hue as the SOLE carrier of "what kind of thing is this", and aria-hidden on
 * top, so a screen reader got nothing at all.
 */
describe('KindDot', () => {
  it('carries three channels: colour, shape and a text name', () => {
    for (const kind of CALENDAR_KINDS) {
      const { container, unmount } = render(<KindDot kind={kind} />)
      const root = container.querySelector('[data-slot="kind-dot"]')!
      const svg = root.querySelector('svg')!

      expect(svg.getAttribute('style')).toContain(KIND_DOT[kind])
      expect(root.getAttribute('data-shape')).toBe(KIND_SHAPE[kind])
      expect(screen.getByText(CALENDAR_KIND_LABELS[kind]).className).toContain('sr-only')
      unmount()
    }
  })

  it('draws a DIFFERENT silhouette for every kind — survives greyscale', () => {
    const geometry = CALENDAR_KINDS.map((kind) => {
      const { container, unmount } = render(<KindDot kind={kind} />)
      const svg = container.querySelector('svg')!
      // Everything about the mark except its colour.
      const shape = Array.from(svg.children)
        .map((n) => `${n.tagName}:${Array.from(n.attributes).map((a) => `${a.name}=${a.value}`).join(',')}`)
        .join('|')
      unmount()
      return shape
    })
    expect(new Set(geometry).size).toBe(CALENDAR_KINDS.length)
    expect(geometry.every((g) => g.length > 0)).toBe(true)
  })

  it('renders at the 8px grid size against an 8-unit viewBox', () => {
    // Marks live in month cells and agenda rows; a shape inset inside a 6px box
    // stops being a shape. The geometry uses the whole 8x8 box.
    const { container } = render(<KindDot kind="event" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 8 8')
    expect(svg.getAttribute('class')).toContain('size-2')
    expect(svg).toHaveAttribute('aria-hidden')
  })

  it('drops the text name only when asked, for parents that already announce it', () => {
    const { queryByText } = render(<KindDot kind="event" hideLabel />)
    expect(queryByText(CALENDAR_KIND_LABELS.event)).toBeNull()
  })

  it('distinguishes booked from tentative by FILL, not just hue', () => {
    // The pair the aliased palette collapsed to one swatch. Same family
    // (square), different commitment (solid vs hollow).
    expect(KIND_SHAPE.event).toBe('square')
    expect(KIND_SHAPE.lead).toBe('square-hollow')
    const solid = render(<KindDot kind="event" />).container.querySelector('rect')!
    const hollow = render(<KindDot kind="lead" />).container.querySelector('rect')!
    expect(solid.getAttribute('fill')).toBe('currentColor')
    expect(hollow.getAttribute('fill')).toBe('none')
    expect(hollow.getAttribute('stroke')).toBe('currentColor')
    expect(Number(hollow.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(1.5)
  })
})

describe('KindLegend', () => {
  it('names and draws all seven kinds', () => {
    const { container } = render(<KindLegend />)
    expect(container.querySelectorAll('[data-slot="kind-dot"]')).toHaveLength(CALENDAR_KINDS.length)
    for (const kind of CALENDAR_KINDS) {
      expect(screen.getByText(CALENDAR_KIND_LABELS[kind])).toBeInTheDocument()
    }
  })
})
