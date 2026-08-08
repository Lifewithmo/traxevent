export interface Terminology {
  registrantSingular: string
  registrantPlural: string
  memberSingular: string
  memberPlural: string
  assignmentSingular: string
  assignmentPlural: string
  eventLabel: string
}

export type RegistrationUnit = 'family' | 'individual' | 'child'

export type EventTypeId = 'event' | 'catering' | 'photo-shoot' | 'floral-event' | 'coffee-service'

export interface EventType {
  id: EventTypeId | string
  name: string
  description: string
  registrationUnit: RegistrationUnit
  terminology: Terminology
  is_custom?: boolean
}

export const DEFAULT_EVENT_TYPE_ID: EventTypeId = 'event'

const BUILT_IN_EVENT_TYPES: EventType[] = [
  {
    id: 'event',
    name: 'General Event',
    description: 'A booked event with customers and guests',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Customer', registrantPlural: 'Customers',
      memberSingular: 'Guest', memberPlural: 'Guests',
      assignmentSingular: 'Assignment', assignmentPlural: 'Assignments',
      eventLabel: 'Event',
    },
  },
  {
    id: 'catering',
    name: 'Catering',
    description: 'Event catering with menu, headcount, and stations',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Client', registrantPlural: 'Clients',
      memberSingular: 'Guest', memberPlural: 'Guests',
      assignmentSingular: 'Station', assignmentPlural: 'Stations',
      eventLabel: 'Event',
    },
  },
  {
    id: 'photo-shoot',
    name: 'Photography',
    description: 'Photo/video sessions with clients and subjects',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Client', registrantPlural: 'Clients',
      memberSingular: 'Subject', memberPlural: 'Subjects',
      assignmentSingular: 'Session', assignmentPlural: 'Sessions',
      eventLabel: 'Shoot',
    },
  },
  {
    id: 'floral-event',
    name: 'Floral & Event Design',
    description: 'Floral design and installation for events',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Client', registrantPlural: 'Clients',
      memberSingular: 'Recipient', memberPlural: 'Recipients',
      assignmentSingular: 'Delivery', assignmentPlural: 'Deliveries',
      eventLabel: 'Event',
    },
  },
  {
    id: 'coffee-service',
    name: 'Mobile Beverage',
    description: 'Mobile coffee/beverage service for events',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Client', registrantPlural: 'Clients',
      memberSingular: 'Guest', memberPlural: 'Guests',
      assignmentSingular: 'Station', assignmentPlural: 'Stations',
      eventLabel: 'Service',
    },
  },
]

const EVENT_TYPE_MAP = new Map<string, EventType>(BUILT_IN_EVENT_TYPES.map((et) => [et.id, et]))

export function getEventType(id: string): EventType {
  return EVENT_TYPE_MAP.get(id) ?? EVENT_TYPE_MAP.get(DEFAULT_EVENT_TYPE_ID)!
}

export function getAllEventTypes(): EventType[] {
  return [...BUILT_IN_EVENT_TYPES]
}

// Pure + sync; safe in server and client components.
export function resolveTerminology(eventTypeId: string, snapshot?: Terminology): Terminology {
  return snapshot ?? getEventType(eventTypeId).terminology
}

export interface EventCreateFields {
  event_type_id: string
  registration_type: RegistrationUnit
  event_type_terminology?: Terminology
}

/**
 * The event fields a selected EventType determines. Custom (org-defined) types
 * snapshot their terminology onto the event because the type can be renamed
 * later; built-ins resolve by id and carry no copy.
 */
export function eventCreateFieldsFromType(type: EventType): EventCreateFields {
  return {
    event_type_id: type.id,
    registration_type: type.registrationUnit,
    ...(type.is_custom ? { event_type_terminology: type.terminology } : {}),
  }
}
