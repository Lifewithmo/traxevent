import type { EventTypeId } from '@/lib/event-types'

export type ModuleId =
  | 'leads' | 'clients' | 'proposals' | 'invoices'
  | 'events' | 'registrants' | 'vendors' | 'calendar' | 'reports'
  // Forward-declared for later phases; no nav renders these yet.
  | 'catalog' | 'compliance' | 'inventory' | 'deliverables' | 'routing' | 'pos'
  | 'attendee-roster'

export interface IndustryPack {
  id: string
  name: string
  description: string
  eventTypeId: EventTypeId | string   // terminology comes from the event type
  modules: ModuleId[]                  // which admin modules are active
  catalogKind: 'menu' | 'services' | 'rental-stock' | null
  publicMode: boolean                  // food-truck public-sale / POS mode
}

export const DEFAULT_INDUSTRY_PACK_ID = 'general'

// Everything currently shipped in the workspace nav — the backwards-compatible default.
const ALL_CURRENT_MODULES: ModuleId[] = [
  'leads', 'clients', 'proposals', 'invoices',
  'events', 'registrants', 'vendors', 'calendar', 'reports',
]

const BUILT_IN_PACKS: IndustryPack[] = [
  {
    id: 'general',
    name: 'General',
    description: 'Every module enabled — the default for existing orgs.',
    eventTypeId: 'event',
    modules: [...ALL_CURRENT_MODULES, 'attendee-roster'],
    catalogKind: null,
    publicMode: false,
  },
  {
    id: 'coffee-cart',
    name: 'Coffee Cart',
    description: 'Mobile beverage vendor booking private events.',
    eventTypeId: 'coffee-service',
    modules: ['leads', 'clients', 'proposals', 'invoices', 'calendar', 'reports', 'catalog', 'compliance', 'inventory'],
    catalogKind: 'menu',
    publicMode: false,
  },
  {
    id: 'caterer',
    name: 'Caterer',
    description: 'Event catering: menu, headcount, staffing, delivery.',
    eventTypeId: 'catering',
    modules: ['leads', 'clients', 'proposals', 'invoices', 'calendar', 'reports', 'catalog', 'inventory', 'deliverables', 'routing'],
    catalogKind: 'menu',
    publicMode: false,
  },
  {
    id: 'florist',
    name: 'Event Florist',
    description: 'Wedding & event floral design and installation.',
    eventTypeId: 'floral-event',
    modules: ['leads', 'clients', 'proposals', 'invoices', 'calendar', 'reports', 'inventory', 'deliverables', 'routing'],
    catalogKind: 'services',
    publicMode: false,
  },
  {
    id: 'photographer',
    name: 'Photographer',
    description: 'Event & portrait photography with questionnaires and galleries.',
    eventTypeId: 'photo-shoot',
    modules: ['leads', 'clients', 'proposals', 'invoices', 'calendar', 'reports', 'deliverables'],
    catalogKind: 'services',
    publicMode: false,
  },
]

const PACK_MAP = new Map<string, IndustryPack>(BUILT_IN_PACKS.map((p) => [p.id, p]))

export function getIndustryPack(id?: string): IndustryPack {
  return (id ? PACK_MAP.get(id) : undefined) ?? PACK_MAP.get(DEFAULT_INDUSTRY_PACK_ID)!
}

export function getAllIndustryPacks(): IndustryPack[] {
  return [...BUILT_IN_PACKS]
}

export function isModuleEnabled(pack: IndustryPack, moduleId: ModuleId): boolean {
  return pack.modules.includes(moduleId)
}

export function resolveEnabledModules(industryPackId?: string): ModuleId[] {
  return getIndustryPack(industryPackId).modules
}

/** Vertical-skinned label for the catalog module (spec §4: "no shared noun renders untranslated"). */
export function catalogLabel(pack: IndustryPack): string {
  switch (pack.catalogKind) {
    case 'menu': return 'Menu Packages'
    case 'services': return 'Service Packages'
    case 'rental-stock': return 'Rental Packages'
    default: return 'Packages'
  }
}
