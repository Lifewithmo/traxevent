import type { Org, Camp } from '@/lib/types'

export interface PortalEvent {
  orgSlug: string
  orgName: string
  campSlug: string
  campName: string
  year: number
  camp_start: string
  camp_end: string
  registerPath: string
}

export interface OrgCamps {
  org: Org
  camps: Camp[]
}

// Flatten member-org → camps into a single list of register links, sorted by start date.
export function buildPortalEvents(perOrg: OrgCamps[]): PortalEvent[] {
  const events: PortalEvent[] = []
  for (const { org, camps } of perOrg) {
    for (const camp of camps) {
      events.push({
        orgSlug: org.slug,
        orgName: org.name,
        campSlug: camp.slug,
        campName: camp.name,
        year: camp.year,
        camp_start: camp.camp_start,
        camp_end: camp.camp_end,
        registerPath: `/${org.slug}/${camp.slug}/register`,
      })
    }
  }
  return events.sort((a, b) => a.camp_start.localeCompare(b.camp_start))
}

// CSS custom properties for a network's brand colors (spread into a style={} prop).
export function portalThemeVars(network: { primary_color?: string; accent_color?: string }): Record<string, string> {
  const vars: Record<string, string> = {}
  if (network.primary_color) vars['--portal-primary'] = network.primary_color
  if (network.accent_color) vars['--portal-accent'] = network.accent_color
  return vars
}
