import type {
  Org, OrgMember, Event, Family, FamilyMember, FormTemplate, EventFormAssignment, SignedForm,
} from '@/lib/types'
import type { CustodyCheckinRecord } from '@/actions/checkins'
import { buildEventSlug } from '@/lib/slug'
import { daysFrom, isoFrom } from '@/scripts/seed/dates'

/**
 * A second demo org — an attendee-roster operation (a day camp on the
 * 'general' pack, which enables the attendee-roster module) owned by the SAME
 * demo auth user as the BrewTrax org, so one login can walk both tenants.
 *
 * The org id carries the mandatory `demo-` prefix (scripts/seed/args.ts's
 * allow-list is what makes the recursive delete unable to touch a real
 * tenant); the public slug stays the plain 'pinecrest-day-camp'.
 *
 * Everything here is a pure function of `today`: one child-registration
 * (guardian-mode) event dated today, ten families tuned for the check-in
 * walkthrough — allergy/medical flags, balances due, a waitlisted family, a
 * required waiver signed by six of ten — and two pre-existing custody records
 * for today (one child currently IN, one full in→out cycle with a guardian).
 */

export const ROSTER_ORG_ID = 'demo-pinecrest-day-camp'
export const ROSTER_ORG_SLUG = 'pinecrest-day-camp'
export const ROSTER_ORG_NAME = 'Pinecrest Day Camp'
export const ROSTER_EVENT_ID = 'demo-event-pinecrest-01'
const EVENT_NAME = 'Pinecrest Summer Day Camp'

export interface SeedRosterFamily {
  family: Family
  members: FamilyMember[]
  /** Present = a signed copy of the required waiver under this family. */
  signedForm?: SignedForm
}

export interface RosterSeed {
  org: Omit<Org, 'id'>
  /** `uid`, `display_name`, and `email` come from the resolved auth user. */
  member: Omit<OrgMember, 'uid' | 'display_name' | 'email'>
  event: Event
  formTemplate: FormTemplate
  formAssignment: EventFormAssignment
  families: SeedRosterFamily[]
  checkins: CustodyCheckinRecord[]
}

interface FamilySpec {
  n: number
  parentFirst: string
  surname: string
  email: string
  phone: string
  street: string
  emergency: { name: string; phone: string; relationship: string }
  status: Family['registration_status']
  /** [amount_due, amount_paid]; omitted = no admin-managed money fields yet. */
  money?: [number, number]
  signed?: { signer: string }
  kids: {
    id: string
    first: string
    birth_year: number
    gender: string
    grade: string
    allergies?: string
    medical?: string
  }[]
}

export function buildRosterSeed(today: Date): RosterSeed {
  const todayYmd = daysFrom(today, 0)
  const year = Number(todayYmd.slice(0, 4))

  const org: RosterSeed['org'] = {
    name: ROSTER_ORG_NAME,
    slug: ROSTER_ORG_SLUG,
    billing_status: 'active',
    plan: 'standard',
    industry_pack_id: 'general', // the pack that enables 'attendee-roster'
    created_at: isoFrom(today, -140),
  }

  const event: Event = {
    id: ROSTER_EVENT_ID,
    name: EVENT_NAME,
    slug: buildEventSlug(EVENT_NAME, year),
    year,
    status: 'active',
    registration_type: 'child', // guardian mode; notify_family_on_pickup ABSENT ⇒ default ON
    event_type_id: 'event',
    event_start: todayYmd,
    event_end: todayYmd,
    hours: { start: '08:00', end: '15:30' },
    capacity: 9, // nine active families — why the tenth sits waitlisted
    payment_amount: 185,
    created_at: isoFrom(today, -60),
  }

  const formTemplate: FormTemplate = {
    id: 'demo-form-waiver',
    name: 'Liability waiver',
    form_type: 'liability_waiver',
    audience: 'registrant',
    fields: [
      { id: 'fld-agree', type: 'checkbox', label: 'I have read and agree to the release of liability above', required: true },
      { id: 'fld-guardian-name', type: 'text', label: 'Parent/guardian full name', required: true },
    ],
    version: 1,
    created_at: isoFrom(today, -58),
  }

  // Snapshot semantics mirror assignFormToEvent: the assignment carries the
  // template's fields/version as they were at assignment time.
  const formAssignment: EventFormAssignment = {
    id: 'demo-form-assign-waiver',
    template_id: formTemplate.id,
    template_name: formTemplate.name,
    template_version: formTemplate.version,
    fields_snapshot: formTemplate.fields,
    audience: 'registrant',
    required: true,
    created_at: isoFrom(today, -57),
  }

  // Ten families, varied surnames for the roster search. Money and waiver
  // states are tuned so the check-in desk shows every flag at least once:
  //   - allergy/medical text on 4 children;
  //   - positive balance due on 4 families (Okafor, Bennett, Nakamura, Delgado);
  //   - waiver signed by 6 of 10 (missing-form flags on the other 4);
  //   - one waitlisted family (Kaur);
  //   - emergency contact on 9 of 10 (Delgado's is empty).
  const specs: FamilySpec[] = [
    {
      n: 1, parentFirst: 'Grace', surname: 'Chen', email: 'grace.chen@example.com', phone: '208-555-0301',
      street: '412 Alder Ct', emergency: { name: 'Wei Chen', phone: '208-555-0302', relationship: 'Grandfather' },
      status: 'confirmed', money: [370, 370], signed: { signer: 'Grace Chen' },
      kids: [
        { id: 'demo-cam-chen-lily', first: 'Lily', birth_year: 2017, gender: 'F', grade: '3', allergies: 'Peanut allergy — EpiPen in bag' },
        { id: 'demo-cam-chen-owen', first: 'Owen', birth_year: 2019, gender: 'M', grade: '1' },
      ],
    },
    {
      n: 2, parentFirst: 'Miguel', surname: 'Alvarez', email: 'miguel.alvarez@example.com', phone: '208-555-0311',
      street: '88 Sycamore Ln', emergency: { name: 'Carla Alvarez', phone: '208-555-0312', relationship: 'Aunt' },
      status: 'confirmed', money: [185, 185], signed: { signer: 'Miguel Alvarez' },
      kids: [{ id: 'demo-cam-alvarez-sofia', first: 'Sofia', birth_year: 2016, gender: 'F', grade: '4' }],
    },
    {
      n: 3, parentFirst: 'Adaeze', surname: 'Okafor', email: 'adaeze.okafor@example.com', phone: '208-555-0321',
      street: '1520 Basalt Dr', emergency: { name: 'Chuka Okafor', phone: '208-555-0322', relationship: 'Uncle' },
      status: 'confirmed', money: [555, 300], signed: { signer: 'Adaeze Okafor' },
      kids: [
        { id: 'demo-cam-okafor-chidi', first: 'Chidi', birth_year: 2015, gender: 'M', grade: '5', medical: 'Asthma — inhaler in backpack side pocket' },
        { id: 'demo-cam-okafor-ngozi', first: 'Ngozi', birth_year: 2017, gender: 'F', grade: '3' },
        { id: 'demo-cam-okafor-emeka', first: 'Emeka', birth_year: 2020, gender: 'M', grade: 'K' },
      ],
    },
    {
      n: 4, parentFirst: 'Sarah', surname: 'Bennett', email: 'sarah.bennett@example.com', phone: '208-555-0331',
      street: '67 Quail Ridge Rd', emergency: { name: 'Tom Bennett', phone: '208-555-0332', relationship: 'Father' },
      status: 'confirmed', money: [185, 0], // unpaid AND unsigned — the checked-in child below
      kids: [{ id: 'demo-cam-bennett-jack', first: 'Jack', birth_year: 2018, gender: 'M', grade: '2' }],
    },
    {
      n: 5, parentFirst: 'Marco', surname: 'Rossi', email: 'marco.rossi@example.com', phone: '208-555-0341',
      street: '9 Fig Tree Way', emergency: { name: 'Lucia Rossi', phone: '208-555-0342', relationship: 'Mother' },
      status: 'confirmed', money: [370, 370], signed: { signer: 'Marco Rossi' },
      kids: [
        { id: 'demo-cam-rossi-elena', first: 'Elena', birth_year: 2016, gender: 'F', grade: '4', allergies: 'Tree-nut allergy', medical: 'Carries antihistamine' },
        { id: 'demo-cam-rossi-luca', first: 'Luca', birth_year: 2018, gender: 'M', grade: '2' },
      ],
    },
    {
      n: 6, parentFirst: 'Yuki', surname: 'Nakamura', email: 'yuki.nakamura@example.com', phone: '208-555-0351',
      street: '230 Chukar St', emergency: { name: 'Kenji Nakamura', phone: '208-555-0352', relationship: 'Father' },
      status: 'confirmed', money: [185, 90],
      kids: [{ id: 'demo-cam-nakamura-ren', first: 'Ren', birth_year: 2017, gender: 'M', grade: '3' }],
    },
    {
      n: 7, parentFirst: 'Dana', surname: 'Whitfield', email: 'dana.whitfield@example.com', phone: '208-555-0361',
      street: '5501 Larchwood Ave', emergency: { name: 'Reggie Whitfield', phone: '208-555-0362', relationship: 'Grandfather' },
      status: 'confirmed', money: [370, 370], signed: { signer: 'Dana Whitfield' },
      kids: [
        { id: 'demo-cam-whitfield-harper', first: 'Harper', birth_year: 2019, gender: 'F', grade: '1' },
        { id: 'demo-cam-whitfield-mason', first: 'Mason', birth_year: 2015, gender: 'M', grade: '5' },
      ],
    },
    {
      n: 8, parentFirst: 'Kwame', surname: 'Osei', email: 'kwame.osei@example.com', phone: '208-555-0371',
      street: '14 Bitterroot Cir', emergency: { name: 'Abena Osei', phone: '208-555-0372', relationship: 'Mother' },
      status: 'confirmed', money: [185, 185], signed: { signer: 'Kwame Osei' },
      kids: [{ id: 'demo-cam-osei-ama', first: 'Ama', birth_year: 2018, gender: 'F', grade: '2', medical: 'Type 1 diabetes — CGM; call parent if it alarms' }],
    },
    {
      n: 9, parentFirst: 'Rosa', surname: 'Delgado', email: 'rosa.delgado@example.com', phone: '208-555-0381',
      street: '780 Mesa Verde Pl', emergency: { name: '', phone: '', relationship: '' }, // the one family with no emergency contact
      status: 'confirmed', money: [370, 0],
      kids: [
        { id: 'demo-cam-delgado-mateo', first: 'Mateo', birth_year: 2016, gender: 'M', grade: '4' },
        { id: 'demo-cam-delgado-isabella', first: 'Isabella', birth_year: 2020, gender: 'F', grade: 'K' },
      ],
    },
    {
      n: 10, parentFirst: 'Simran', surname: 'Kaur', email: 'simran.kaur@example.com', phone: '208-555-0391',
      street: '33 Foothill Ter', emergency: { name: 'Harpreet Kaur', phone: '208-555-0392', relationship: 'Mother' },
      status: 'waitlisted',
      kids: [{ id: 'demo-cam-kaur-arjun', first: 'Arjun', birth_year: 2017, gender: 'M', grade: '3' }],
    },
  ]

  const families: SeedRosterFamily[] = specs.map((s) => {
    const familyId = `demo-fam-${String(s.n).padStart(2, '0')}`
    const createdAt = isoFrom(today, -55 + s.n)
    const [due, paid] = s.money ?? []
    const family: Family = {
      id: familyId,
      org_id: ROSTER_ORG_ID,
      event_id: ROSTER_EVENT_ID,
      org_slug: ROSTER_ORG_SLUG,
      event_slug: event.slug,
      event_name: EVENT_NAME,
      org_name: ROSTER_ORG_NAME,
      first_name: s.parentFirst,
      last_name: s.surname,
      email: s.email,
      phone: s.phone,
      address: { street: s.street, city: 'Boise', state: 'ID', zip: '83702' },
      emergency_contact: s.emergency,
      registration_status: s.status,
      payment_status:
        due === undefined ? 'unpaid'
        : (paid ?? 0) >= due ? 'paid'
        : (paid ?? 0) > 0 ? 'partial'
        : 'unpaid',
      registrant_uid: null,
      pco_household_id: null,
      access_token: null,
      access_token_expires_at: null,
      created_at: createdAt,
      updated_at: createdAt,
      ...(due !== undefined ? { amount_due: due, amount_paid: paid } : {}),
    }
    const members: FamilyMember[] = s.kids.map((k) => ({
      id: k.id,
      family_id: familyId,
      first_name: k.first,
      last_name: s.surname,
      birth_year: k.birth_year,
      gender: k.gender,
      grade: k.grade,
      allergies: k.allergies ?? '',
      dietary_restrictions: '',
      tshirt_size: 'YM',
      medical_notes: k.medical ?? '',
    }))
    const signedForm: SignedForm | undefined = s.signed
      ? {
          id: `demo-signed-${String(s.n).padStart(2, '0')}`,
          org_id: ROSTER_ORG_ID,
          event_id: ROSTER_EVENT_ID,
          assignment_id: formAssignment.id,
          template_id: formTemplate.id,
          template_version: formTemplate.version,
          template_name: formTemplate.name,
          responses: { 'fld-agree': true, 'fld-guardian-name': s.signed.signer },
          signature_name: s.signed.signer,
          signer_ip: 'seed',
          signed_at: isoFrom(today, -40 + s.n),
          created_at: isoFrom(today, -40 + s.n),
        }
      : undefined
    return { family, members, ...(signedForm ? { signedForm } : {}) }
  })

  // Two pre-existing custody records for TODAY, in the inc-2 shape the check-in
  // screen writes (history entries with server-stamped ids):
  //   - Jack Bennett is currently IN — unpaid balance + missing waiver, so his
  //     checkout walks the guardian dialog with both flags showing;
  //   - Sofia Alvarez already completed a full in→out cycle, picked up by a
  //     listed guardian.
  const jackIn = isoFrom(today, 0, '14:38') // ~08:38 MDT
  const sofiaIn = isoFrom(today, 0, '14:32')
  const sofiaOut = isoFrom(today, 0, '19:41') // ~13:41 MDT
  const checkins: CustodyCheckinRecord[] = [
    {
      id: `${todayYmd}_demo-cam-bennett-jack`,
      date: todayYmd,
      member_id: 'demo-cam-bennett-jack',
      family_id: 'demo-fam-04',
      member_name: 'Jack Bennett',
      status: 'in',
      checked_in_at: jackIn,
      first_checked_in_at: jackIn,
      history: [{ id: 'demo-chk-jack-in-1', action: 'check_in', at: jackIn }],
    },
    {
      id: `${todayYmd}_demo-cam-alvarez-sofia`,
      date: todayYmd,
      member_id: 'demo-cam-alvarez-sofia',
      family_id: 'demo-fam-02',
      member_name: 'Sofia Alvarez',
      status: 'out',
      checked_in_at: sofiaIn,
      first_checked_in_at: sofiaIn,
      checked_out_at: sofiaOut,
      guardian_pickup_name: 'Miguel Alvarez',
      history: [
        { id: 'demo-chk-sofia-in-1', action: 'check_in', at: sofiaIn },
        { id: 'demo-chk-sofia-out-1', action: 'check_out', at: sofiaOut, guardian: 'Miguel Alvarez' },
      ],
    },
  ]

  return {
    org,
    member: { role: 'owner', event_access: {} },
    event,
    formTemplate,
    formAssignment,
    families,
    checkins,
  }
}
