/**
 * Pure CLI parsing for the demo seeder. This module is the safety boundary:
 * the `demo-` prefix check is what makes the reset path structurally unable
 * to target a real tenant, so every org id must come from here.
 */

export const DEFAULT_ORG_ID = 'demo-brewtrax'

/**
 * PUBLISHED CREDENTIALS — these two literals are committed to a public-facing
 * repo, and the account they name is a real Firebase Auth user in whatever
 * project `FIREBASE_PROJECT_ID` points at (today: the production project).
 * The seeder scopes that account to `owner` of a `demo-` org, so the blast
 * radius is demo data — but an org owner still reaches the communicate module
 * and org settings for that org.
 *
 * They are defaults on purpose: `npm run seed:demo` has to work with no
 * arguments. If the app is reachable from the internet, pass `--password=...`
 * (and rotate the existing account's password out of band) rather than relying
 * on a value anyone can read here.
 */
export const DEFAULT_EMAIL = 'demo@brewtrax.test'
export const DEFAULT_PASSWORD = 'BrewTrax!Demo1'

/**
 * Allow-list, not a prefix test. A prefix-only check leaves the id's remaining
 * characters unconstrained, which puts the safety of the recursive delete on
 * whatever the Firestore server happens to reject (`..`, `/`) rather than on
 * code this repo owns. Anchored, lowercase, and no path separators.
 */
const DEMO_ORG_ID_PATTERN = /^demo-[a-z0-9][a-z0-9-]*$/

export interface SeedArgs {
  orgId: string
  email: string
  password: string
  reset: boolean
}

/**
 * Throws unless `orgId` is `demo-` followed by at least one alphanumeric and
 * then only lowercase alphanumerics or hyphens.
 */
export function assertDemoOrgId(orgId: string): void {
  if (!DEMO_ORG_ID_PATTERN.test(orgId)) {
    throw new Error(
      `Refusing to touch org "${orgId}": the seeder only operates on ids that must start with "demo-" ` +
        `and then contain only lowercase letters, digits, and hyphens (${DEMO_ORG_ID_PATTERN}). ` +
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
  if (!password.trim()) throw new Error('Password cannot be empty')

  return { orgId, email, password, reset }
}
