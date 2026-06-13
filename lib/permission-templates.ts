import type { PermissionTemplate, CampPage } from '@/lib/types'

export const BUILT_IN_TEMPLATE_IDS = [
  'builtin-cabin-leader',
  'builtin-checkin-volunteer',
  'builtin-finance-admin',
  'builtin-event-overseer',
] as const

const BUILT_IN_TEMPLATES: PermissionTemplate[] = [
  {
    id: 'builtin-cabin-leader',
    name: 'Cabin Leader',
    description: 'Roster, assignments, and forms for their group',
    pages: ['families', 'assignments', 'forms'],
    is_built_in: true,
  },
  {
    id: 'builtin-checkin-volunteer',
    name: 'Check-in Volunteer',
    description: 'Registrant names and basic info only',
    pages: ['families'],
    is_built_in: true,
  },
  {
    id: 'builtin-finance-admin',
    name: 'Finance Admin',
    description: 'Payments, budget, and financial reports',
    pages: ['families', 'budget', 'reports'],
    is_built_in: true,
  },
  {
    id: 'builtin-event-overseer',
    name: 'Event Overseer',
    description: 'Full access except budget/finances',
    pages: ['dashboard', 'families', 'assignments', 'teams', 'itinerary', 'communicate', 'forms', 'people', 'reports'],
    is_built_in: true,
  },
]

// Return deep copies so callers cannot mutate the module-level constants.
export function getBuiltInPermissionTemplates(): PermissionTemplate[] {
  return BUILT_IN_TEMPLATES.map((t) => ({ ...t, pages: [...t.pages] as CampPage[] }))
}
