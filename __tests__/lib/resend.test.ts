import { describe, it, expect } from 'vitest'
import { buildFromAddress, deriveLocalPart, resolveSenderEmail, FROM_EMAIL } from '@/lib/resend'

describe('buildFromAddress', () => {
  it('defaults to the platform address with no opts', () => {
    expect(buildFromAddress({})).toBe(FROM_EMAIL)
  })

  it('uses a verified custom domain', () => {
    expect(buildFromAddress({ domain: 'mail.x.org' })).toBe('noreply@mail.x.org')
  })

  it('wraps a display name as an RFC 5322 quoted string and escapes quotes', () => {
    expect(buildFromAddress({ displayName: 'Camp "Sunshine"', domain: 'mail.x.org' }))
      .toBe('"Camp \\"Sunshine\\"" <noreply@mail.x.org>')
  })

  it('uses a full senderEmail when provided, overriding the default local part', () => {
    expect(buildFromAddress({ displayName: 'John Smith', senderEmail: 'john@mail.x.org' }))
      .toBe('"John Smith" <john@mail.x.org>')
  })
})

describe('deriveLocalPart', () => {
  it('takes the local part of an email', () => {
    expect(deriveLocalPart('John.Smith@whatever.com')).toBe('john.smith')
  })
  it('slugifies a plain name', () => {
    expect(deriveLocalPart('John Smith')).toBe('john.smith')
  })
  it('strips unsafe characters', () => {
    expect(deriveLocalPart('Renée O’Brien!')).toBe('renee.obrien')
  })
})

describe('resolveSenderEmail', () => {
  it('composes local@verifiedDomain', () => {
    expect(resolveSenderEmail({ verifiedDomain: 'mail.x.org', localPart: 'john' })).toBe('john@mail.x.org')
  })
  it('returns undefined without a verified domain', () => {
    expect(resolveSenderEmail({ verifiedDomain: undefined, localPart: 'john' })).toBeUndefined()
  })
  it('returns undefined with an empty local part', () => {
    expect(resolveSenderEmail({ verifiedDomain: 'mail.x.org', localPart: '' })).toBeUndefined()
  })
})
