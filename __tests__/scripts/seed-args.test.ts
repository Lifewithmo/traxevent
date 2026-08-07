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

  it('rejects a whitespace-only password, like a whitespace-only email', () => {
    expect(() => parseSeedArgs(['--password=   '])).toThrow(/Password cannot be empty/)
  })

  // These three tests lock in the guard's rejection surface against future refactors.
  // Each one catches a specific, plausible regression (case-insensitive prefix check,
  // validating inside the loop, or trimming before the check).
  it('rejects an org id whose demo- prefix differs in case', () => {
    expect(() => parseSeedArgs(['--org-id=DEMO-brewtrax'])).toThrow(/must start with "demo-"/)
  })

  it('validates the last --org-id when the flag is repeated', () => {
    expect(() => parseSeedArgs(['--org-id=demo-first', '--org-id=acme-corp'])).toThrow(/must start with "demo-"/)
  })

  it('rejects an org id with leading whitespace before the prefix', () => {
    expect(() => parseSeedArgs(['--org-id= demo-brewtrax'])).toThrow(/must start with "demo-"/)
  })

  // The guard is an anchored character allow-list, not a prefix test: nothing
  // outside [a-z0-9-] may reach a Firestore document path, so the safety of the
  // recursive delete does not depend on what the server happens to reject.
  it('rejects an org id containing a path separator', () => {
    expect(() => parseSeedArgs(['--org-id=demo-x/y'])).toThrow(/must start with "demo-"/)
  })

  it('rejects an org id containing path traversal segments', () => {
    expect(() => parseSeedArgs(['--org-id=demo-../../orgs'])).toThrow(/must start with "demo-"/)
  })

  it('rejects an org id with a trailing space after the prefix', () => {
    expect(() => parseSeedArgs(['--org-id=demo- '])).toThrow(/must start with "demo-"/)
  })

  it('rejects an org id whose first character after the prefix is a hyphen', () => {
    expect(() => parseSeedArgs(['--org-id=demo--x'])).toThrow(/must start with "demo-"/)
  })

  it('rejects an org id with uppercase after the prefix', () => {
    expect(() => parseSeedArgs(['--org-id=demo-BrewTrax'])).toThrow(/must start with "demo-"/)
  })
})
