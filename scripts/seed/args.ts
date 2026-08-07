/**
 * Pure CLI parsing for the demo seeder. This module is the safety boundary:
 * the `demo-` prefix check is what makes the reset path structurally unable
 * to target a real tenant, so every org id must come from here.
 */

export const DEFAULT_ORG_ID = 'demo-brewtrax'
export const DEFAULT_EMAIL = 'demo@brewtrax.test'
export const DEFAULT_PASSWORD = 'BrewTrax!Demo1'

const DEMO_PREFIX = 'demo-'

export interface SeedArgs {
  orgId: string
  email: string
  password: string
  reset: boolean
}

/** Throws unless `orgId` starts with `demo-` and has something after it. */
export function assertDemoOrgId(orgId: string): void {
  if (!orgId.startsWith(DEMO_PREFIX) || orgId.length <= DEMO_PREFIX.length) {
    throw new Error(
      `Refusing to touch org "${orgId}": the seeder only operates on ids that must start with "demo-". ` +
        `This guard is what keeps --reset from deleting a real tenant.`,
    )
  }
}

export function parseSeedArgs(argv: string[]): SeedArgs {
  let orgId = DEFAULT_ORG_ID
  let email = DEFAULT_EMAIL
  let password = DEFAULT_PASSWORD
  let reset = false

  for (const arg of argv) {
    if (arg === '--reset') { reset = true; continue }
    if (arg.startsWith('--org-id=')) { orgId = arg.slice('--org-id='.length); continue }
    if (arg.startsWith('--email=')) { email = arg.slice('--email='.length); continue }
    if (arg.startsWith('--password=')) { password = arg.slice('--password='.length); continue }
    throw new Error(`Unknown flag: ${arg}`)
  }

  assertDemoOrgId(orgId)
  if (!email.trim()) throw new Error('Email cannot be empty')
  if (!password) throw new Error('Password cannot be empty')

  return { orgId, email, password, reset }
}
