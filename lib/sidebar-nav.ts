/**
 * Route facts the sidebar and the org layout both need.
 *
 * Lives outside the client component so server code can consult it without
 * pulling a 'use client' module into the server graph.
 */

// Every first-level page under /{orgSlug} that is an ORG page rather than a
// job slug. Anything else in that position is an [eventSlug].
export const ORG_PAGE_SLUGS = new Set([
  'members', 'forms', 'permissions', 'billing', 'email-domain', 'event-types',
  'departments', 'reports', 'registrants', 'today', 'leads', 'clients', 'proposals',
  'invoices', 'vendors', 'calendar', 'new-event', 'packages', 'compliance',
  'money', 'catalog', 'settings', 'branding', 'public-profile', 'proposal-templates',
  'drops',
  // 'drop-orders' is deliberately absent: the orders board relies on the
  // sidebar's self-hide behavior below to render shell-free (see AdminSidebar).
])
