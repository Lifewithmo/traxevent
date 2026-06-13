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

export type EventTypeId = 'summer-camp' | 'retreat' | 'vbs' | 'gala' | 'mission-trip'

export interface EventType {
  id: EventTypeId | string
  name: string
  description: string
  registrationUnit: RegistrationUnit
  terminology: Terminology
  is_custom?: boolean
}

export const DEFAULT_EVENT_TYPE_ID: EventTypeId = 'summer-camp'

const BUILT_IN_EVENT_TYPES: EventType[] = [
  {
    id: 'summer-camp',
    name: 'Summer Camp',
    description: 'Family registration, cabin assignments, daily check-in',
    registrationUnit: 'family',
    terminology: {
      registrantSingular: 'Family',
      registrantPlural: 'Families',
      memberSingular: 'Camper',
      memberPlural: 'Campers',
      assignmentSingular: 'Cabin',
      assignmentPlural: 'Cabins',
      eventLabel: 'Camp',
    },
  },
  {
    id: 'retreat',
    name: 'Retreat',
    description: 'Individual registration, room assignments, meal preferences',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Registrant',
      registrantPlural: 'Registrants',
      memberSingular: 'Attendee',
      memberPlural: 'Attendees',
      assignmentSingular: 'Room',
      assignmentPlural: 'Rooms',
      eventLabel: 'Retreat',
    },
  },
  {
    id: 'vbs',
    name: 'VBS',
    description: 'Child + guardian registration, class assignments, guardian pickup',
    registrationUnit: 'child',
    terminology: {
      registrantSingular: 'Child',
      registrantPlural: 'Children',
      memberSingular: 'Child',
      memberPlural: 'Children',
      assignmentSingular: 'Class',
      assignmentPlural: 'Classes',
      eventLabel: 'VBS',
    },
  },
  {
    id: 'gala',
    name: 'Gala / Fundraiser',
    description: 'Individual or couple registration, table seating, ticket tiers',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Guest',
      registrantPlural: 'Guests',
      memberSingular: 'Guest',
      memberPlural: 'Guests',
      assignmentSingular: 'Table',
      assignmentPlural: 'Tables',
      eventLabel: 'Gala',
    },
  },
  {
    id: 'mission-trip',
    name: 'Mission Trip',
    description: 'Individual registration, team assignments, document collection',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Participant',
      registrantPlural: 'Participants',
      memberSingular: 'Member',
      memberPlural: 'Members',
      assignmentSingular: 'Team',
      assignmentPlural: 'Teams',
      eventLabel: 'Trip',
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
