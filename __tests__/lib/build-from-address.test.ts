import { describe, it, expect } from 'vitest'
import { buildFromAddress, FROM_EMAIL } from '@/lib/resend'

describe('buildFromAddress', () => {
  it('uses the default FROM_EMAIL when no domain', () => {
    expect(buildFromAddress({})).toBe(FROM_EMAIL)
  })

  it('wraps the default with a display name', () => {
    expect(buildFromAddress({ displayName: 'Summer Camp' })).toBe(`"Summer Camp" <${FROM_EMAIL}>`)
  })

  it('uses noreply@<domain> when a custom domain is provided', () => {
    expect(buildFromAddress({ domain: 'mail.firsthills.org' })).toBe('noreply@mail.firsthills.org')
  })

  it('wraps a custom domain with a display name', () => {
    expect(buildFromAddress({ displayName: 'First Hills', domain: 'mail.firsthills.org' })).toBe(
      '"First Hills" <noreply@mail.firsthills.org>'
    )
  })

  it('escapes double-quotes and backslashes in the display name', () => {
    expect(buildFromAddress({ displayName: 'Camp "Pinewood"', domain: 'mail.x.org' })).toBe(
      '"Camp \\"Pinewood\\"" <noreply@mail.x.org>'
    )
  })
})
