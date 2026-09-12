import { describe, it, expect } from 'vitest'
import { kindLabel } from '@/lib/capacity/labels'
import type { Org } from '@/lib/types'

describe('kindLabel', () => {
  it('returns the singular at count 1 and plural otherwise (neutral defaults)', () => {
    const org: Pick<Org, 'resource_labels'> = {}
    expect(kindLabel(org, 'mobile', 1)).toBe('serving unit')
    expect(kindLabel(org, 'mobile', 2)).toBe('serving units')
    expect(kindLabel(org, 'mobile', 0)).toBe('serving units')
    expect(kindLabel(org, 'venue', 1)).toBe('room')
    expect(kindLabel(org, 'venue', 2)).toBe('rooms')
    expect(kindLabel(org, 'venue', 0)).toBe('rooms')
  })

  it('honours an org override for mobile (cart/carts)', () => {
    const org: Pick<Org, 'resource_labels'> = {
      resource_labels: { mobile: { one: 'cart', many: 'carts' } },
    }
    expect(kindLabel(org, 'mobile', 1)).toBe('cart')
    expect(kindLabel(org, 'mobile', 3)).toBe('carts')
    // venue still falls back to the neutral default
    expect(kindLabel(org, 'venue', 1)).toBe('room')
    expect(kindLabel(org, 'venue', 2)).toBe('rooms')
  })

  it('honours a venue override independently', () => {
    const org: Pick<Org, 'resource_labels'> = {
      resource_labels: { venue: { one: 'studio', many: 'studios' } },
    }
    expect(kindLabel(org, 'venue', 1)).toBe('studio')
    expect(kindLabel(org, 'venue', 4)).toBe('studios')
    expect(kindLabel(org, 'mobile', 1)).toBe('serving unit')
  })
})
