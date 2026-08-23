import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * WCAG 1.4.1 as a CROSS-VIEW invariant, not a per-component one.
 *
 * Every kind mark must carry the shape channel, which only `KindDot` provides.
 * The unit tests for `KindDot` and the palette both passed while three of the
 * four primary views still painted kind with hue alone — `AgendaView` kept a
 * local bare-dot shim whose own comment said to delete it, and `TimeGridDay`
 * signalled kind with a 3px coloured border and a bare dot. Testing the brick
 * in isolation cannot see a view that never adopted it, so this asserts
 * adoption at the source level.
 */
const VIEWS = ['AgendaView.tsx', 'MonthGrid.tsx', 'TimeGridDay.tsx'] as const
const dir = join(process.cwd(), 'components/admin/calendar')
const read = (f: string) => readFileSync(join(dir, f), 'utf8')

describe('kind marks carry the non-colour channel in every view', () => {
  it.each(VIEWS)('%s renders kinds through the shared KindDot', (file) => {
    const src = read(file)
    expect(src).toMatch(/import \{ KindDot \} from '@\/components\/admin\/calendar\/KindDot'/)
    expect(src).toMatch(/<KindDot\b/)
  })

  it.each(VIEWS)('%s does not paint a kind swatch straight from KIND_DOT', (file) => {
    const src = read(file)
    // A background/colour driven directly off KIND_DOT is the hue-only pattern.
    // `borderLeftColor` is allowed: it is decorative reinforcement sitting
    // alongside a real KindDot, not the sole channel.
    expect(src).not.toMatch(/background:\s*KIND_DOT\[/)
  })

  it('no view keeps a local component named KindDot shadowing the shared one', () => {
    for (const file of VIEWS) {
      expect(read(file)).not.toMatch(/function KindDot\s*\(/)
    }
  })
})
