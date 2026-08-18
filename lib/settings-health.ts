import type { Org } from '@/lib/types'

export interface SettingsArea {
  slug: string
  label: string
  configured: boolean
}

export interface SettingsInput {
  org: Pick<Org, 'name' | 'branding' | 'public_profile' | 'sending_domain_status'>
  memberCount: number
  templateCount: number
}

/**
 * The nine settings areas plus whether each has been set up. Drives the
 * "what's left to configure" list on the /settings overview.
 * Areas with no meaningful completeness signal report `configured: true`.
 */
export function buildSettingsAreas({ org, memberCount, templateCount }: SettingsInput): SettingsArea[] {
  return [
    { slug: 'members', label: 'Members', configured: memberCount > 1 },
    { slug: 'permissions', label: 'Permissions', configured: true },
    { slug: 'billing', label: 'Billing', configured: true },
    { slug: 'branding', label: 'Branding', configured: Boolean(org.branding?.logo_url) },
    { slug: 'proposal-templates', label: 'Proposal templates', configured: templateCount > 0 },
    { slug: 'public-profile', label: 'Public profile', configured: Boolean(org.public_profile?.enabled) },
    { slug: 'email-domain', label: 'Email domain', configured: org.sending_domain_status === 'verified' },
    { slug: 'event-types', label: 'Event types', configured: true },
    // Shown to every org: a base-tier operator lands on the Business-plan upsell,
    // a business-tier one on the inventory editor (the page itself gates). No
    // completeness nag — `configured: true` keeps it out of the "what's left"
    // list, since a base org has nothing it CAN configure here.
    { slug: 'capacity', label: 'Resources & capacity', configured: true },
    { slug: 'departments', label: 'Departments', configured: true },
  ]
}
