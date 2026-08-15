/**
 * Route facts the sidebar and the org layout both need.
 *
 * Lives outside the client component so the server layout can ask "is this a
 * job route?" without pulling a 'use client' module into the server graph.
 */

/**
 * Header the proxy stamps with the post-rewrite request path, because server
 * components have no other way to read it. Declared here rather than in
 * proxy.ts so a server component can import the name without pulling
 * next/server into its module graph.
 */
export const PATHNAME_HEADER = 'x-tx-pathname'

// Every first-level page under /{orgSlug} that is an ORG page rather than a
// job slug. Anything else in that position is an [eventSlug].
export const ORG_PAGE_SLUGS = new Set([
  'members', 'forms', 'permissions', 'billing', 'email-domain', 'event-types',
  'departments', 'reports', 'registrants', 'today', 'leads', 'clients', 'proposals',
  'invoices', 'vendors', 'calendar', 'new-event', 'packages', 'compliance',
  'money', 'catalog', 'settings', 'branding', 'public-profile', 'proposal-templates',
])

/**
 * True for /{orgSlug}/{eventSlug}[/...] — a page inside a single job.
 * False for /{orgSlug} and every org page. An empty/unknown pathname is
 * reported as "not a job route", so callers degrade to the org behaviour.
 */
export function isJobRoute(pathname: string, orgSlug: string): boolean {
  const seg = pathname.split('/').filter(Boolean)
  if (seg[0] !== orgSlug || seg.length < 2) return false
  return !ORG_PAGE_SLUGS.has(seg[1])
}
