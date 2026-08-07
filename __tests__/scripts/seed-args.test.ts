import { describe, it, expect } from 'vitest'
import { parseSeedArgs, DEFAULT_ORG_ID, DEFAULT_EMAIL, DEFAULT_PASSWORD } from '@/scripts/seed/args'

describe('parseSeedArgs', () => {
  it('defaults to the demo org, demo login, and no reset', () => {
    expect(parseSeedArgs([])).toEqual({
      orgId: DEFAULT_ORG_ID, email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, reset: false,
    })
  })

  it('accepts --reset', () => {
    expect(parseSeedArgs(['--reset']).reset).toBe(true)
  })

  it('accepts an overriding org id that keeps the demo- prefix', () => {
    expect(parseSeedArgs(['--org-id=demo-brewtrax-staging']).orgId).toBe('demo-brewtrax-staging')
  })

  it('accepts --email and --password overrides', () => {
    const args = parseSeedArgs(['--email=me@example.com', '--password=hunter2'])
    expect(args.email).toBe('me@example.com')
    expect(args.password).toBe('hunter2')
  })

  it('rejects an org id without the demo- prefix', () => {
    expect(() => parseSeedArgs(['--org-id=acme-corp'])).toThrow(/must start with "demo-"/)
  })

  it('rejects an org id that only contains demo- later in the string', () => {
    expect(() => parseSeedArgs(['--org-id=prod-demo-brewtrax'])).toThrow(/must start with "demo-"/)
  })

  it('rejects a bare demo- prefix with nothing after it', () => {
    expect(() => parseSeedArgs(['--org-id=demo-'])).toThrow(/must start with "demo-"/)
  })

  it('rejects an empty org id', () => {
    expect(() => parseSeedArgs(['--org-id='])).toThrow(/must start with "demo-"/)
  })

  it('rejects unknown flags rather than ignoring them', () => {
    expect(() => parseSeedArgs(['--force'])).toThrow(/Unknown flag: --force/)
  })

  it('rejects an empty password', () => {
    expect(() => parseSeedArgs(['--password='])).toThrow(/Password cannot be empty/)
  })
})
