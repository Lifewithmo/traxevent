# Phase 2b: Forms & Signatures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let org admins build reusable form templates, assign them to events, and collect legally-valid E-SIGN Act digital signatures from registrants, with signed responses stored write-once in Firestore and a confirmation email sent to each signer.

**Architecture:** Three layers: (1) org-level `form_templates` collection stores reusable form definitions with typed fields; (2) `orgs/{orgId}/camps/{campId}/form_assignments` links templates to events and stores a field snapshot at assignment time so forms remain stable even if the template changes; (3) `families/{familyId}/signed_forms` stores completed responses write-once — the server action that creates them never updates or deletes them, enforcing immutability without requiring Firestore security rule changes in Phase 2b. Digital signature = typed full name + ISO timestamp + client IP from `x-forwarded-for` header, satisfying E-SIGN Act requirements.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, Firebase Admin SDK (Firestore), Resend (confirmation email), `next/headers` (IP extraction)

**Deferred to future phases:** PDF snapshot generation, GCS WORM storage, file upload fields, form versioning UI, dietary/allergy report generation.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/types.ts` | Modify | Add `FormFieldType`, `FormType`, `FormAudience`, `FormField`, `FormTemplate`, `EventFormAssignment`, `SignedForm`; add `'forms'` to `CAMP_PAGES` |
| `actions/forms.ts` | Create | All form CRUD + assignment + submission server actions |
| `lib/email.ts` | Modify | Add `sendFormSignedConfirmation` |
| `components/layout/AdminSidebar.tsx` | Modify | Add "Forms" to camp nav; add "Form Templates" to org-level bottom nav |
| `app/(admin)/[orgSlug]/forms/page.tsx` | Create | Server component — org-level form template list |
| `components/admin/FormTemplatesClient.tsx` | Create | Client — create/edit/delete templates with field builder |
| `app/(admin)/[orgSlug]/[campSlug]/forms/page.tsx` | Create | Server component — event form assignments + signing status |
| `components/admin/EventFormsClient.tsx` | Create | Client — assign/remove forms, see who has signed |
| `app/(registrant)/[orgSlug]/[campSlug]/forms/[assignmentId]/page.tsx` | Create | Registrant form-filling and signature page |
| `app/(registrant)/[orgSlug]/[campSlug]/my-registration/page.tsx` | Modify | Add "Required forms" section with signing status |
| `__tests__/actions/forms.test.ts` | Create | Unit tests for all form server actions |

---

## Task 1: Types + server actions

**Files:**
- Modify: `lib/types.ts`
- Create: `actions/forms.ts`
- Modify: `lib/email.ts`
- Create: `__tests__/actions/forms.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/actions/forms.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const templateDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const assignmentDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const signedFormSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getTemplatesSpy = vi.hoisted(() => vi.fn())
const getAssignmentsSpy = vi.hoisted(() => vi.fn())
const getSignedFormsSpy = vi.hoisted(() => vi.fn())
const getHeadersSpy = vi.hoisted(() => vi.fn())
const sendEmailSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'form_templates') {
                return {
                  doc: vi.fn().mockReturnValue(templateDocSpy),
                  orderBy: vi.fn().mockReturnValue({ get: getTemplatesSpy }),
                }
              }
              if (sub === 'camps') {
                return {
                  doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'form_assignments') {
                        return {
                          doc: vi.fn().mockReturnValue(assignmentDocSpy),
                          orderBy: vi.fn().mockReturnValue({ get: getAssignmentsSpy }),
                        }
                      }
                      if (sub2 === 'families') {
                        return {
                          doc: vi.fn().mockReturnValue({
                            collection: vi.fn().mockReturnValue({
                              doc: vi.fn().mockReturnValue({ set: signedFormSetSpy }),
                              orderBy: vi.fn().mockReturnValue({ get: getSignedFormsSpy }),
                            }),
                          }),
                        }
                      }
                      return {}
                    }),
                  }),
                }
              }
              return {}
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

vi.mock('next/headers', () => ({ headers: getHeadersSpy }))
vi.mock('@/lib/email', () => ({ sendFormSignedConfirmation: sendEmailSpy }))

import {
  createFormTemplate,
  updateFormTemplate,
  deleteFormTemplate,
  assignFormToEvent,
  removeFormAssignment,
  submitSignedForm,
} from '@/actions/forms'

const baseField = {
  id: 'field-1',
  type: 'text' as const,
  label: 'Full name',
  required: true,
}

describe('createFormTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a template with fields', async () => {
    const template = await createFormTemplate('org-1', {
      name: '2026 Liability Waiver',
      formType: 'liability_waiver',
      audience: 'registrant',
      fields: [baseField],
    })
    expect(templateDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '2026 Liability Waiver',
        form_type: 'liability_waiver',
        audience: 'registrant',
        fields: [baseField],
        version: 1,
        created_at: expect.any(String),
      })
    )
    expect(template.name).toBe('2026 Liability Waiver')
    expect(template.version).toBe(1)
  })
})

describe('updateFormTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates fields and increments version', async () => {
    await updateFormTemplate('org-1', 'tmpl-1', { name: 'Updated Waiver' })
    expect(templateDocSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Updated Waiver',
        updated_at: expect.any(String),
      })
    )
  })
})

describe('deleteFormTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the template document', async () => {
    await deleteFormTemplate('org-1', 'tmpl-1')
    expect(templateDocSpy.delete).toHaveBeenCalled()
  })
})

describe('assignFormToEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an assignment with a template snapshot', async () => {
    const template = {
      id: 'tmpl-1',
      name: 'Liability Waiver',
      form_type: 'liability_waiver',
      audience: 'registrant',
      fields: [baseField],
      version: 1,
      created_at: '2026-01-01',
    }
    const assignment = await assignFormToEvent('org-1', 'camp-1', template as never)
    expect(assignmentDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: 'tmpl-1',
        template_name: 'Liability Waiver',
        fields_snapshot: [baseField],
        template_version: 1,
        audience: 'registrant',
        created_at: expect.any(String),
      })
    )
    expect(assignment.template_id).toBe('tmpl-1')
  })
})

describe('removeFormAssignment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the assignment document', async () => {
    await removeFormAssignment('org-1', 'camp-1', 'assign-1')
    expect(assignmentDocSpy.delete).toHaveBeenCalled()
  })
})

describe('submitSignedForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeadersSpy.mockResolvedValue({
      get: (key: string) => {
        if (key === 'x-forwarded-for') return '1.2.3.4'
        return null
      },
    })
  })

  it('stores signed form with responses, signature name, IP, and timestamp', async () => {
    const signed = await submitSignedForm('org-1', 'camp-1', 'fam-1', {
      assignmentId: 'assign-1',
      templateId: 'tmpl-1',
      templateVersion: 1,
      templateName: 'Liability Waiver',
      responses: { 'field-1': 'Jane Smith' },
      signatureName: 'Jane Smith',
      signerEmail: 'jane@example.com',
      signerFirstName: 'Jane',
      campName: 'Summer Camp 2026',
      orgName: 'First Hills',
      orgSlug: 'firsthills',
      campSlug: 'summer-2026',
    })
    expect(signedFormSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        assignment_id: 'assign-1',
        template_id: 'tmpl-1',
        template_version: 1,
        signature_name: 'Jane Smith',
        signer_ip: '1.2.3.4',
        signed_at: expect.any(String),
        responses: { 'field-1': 'Jane Smith' },
      })
    )
    expect(signed.signature_name).toBe('Jane Smith')
  })

  it('sends a confirmation email after signing', async () => {
    await submitSignedForm('org-1', 'camp-1', 'fam-1', {
      assignmentId: 'assign-1',
      templateId: 'tmpl-1',
      templateVersion: 1,
      templateName: 'Liability Waiver',
      responses: {},
      signatureName: 'Jane Smith',
      signerEmail: 'jane@example.com',
      signerFirstName: 'Jane',
      campName: 'Summer Camp 2026',
      orgName: 'First Hills',
      orgSlug: 'firsthills',
      campSlug: 'summer-2026',
    })
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jane@example.com',
        firstName: 'Jane',
        formName: 'Liability Waiver',
        campName: 'Summer Camp 2026',
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/actions/forms.test.ts
```

Expected: FAIL — `Cannot find module '@/actions/forms'`

- [ ] **Step 3: Update `lib/types.ts`**

Add to `CAMP_PAGES` (add `'forms'` before the closing `] as const`):

```typescript
export const CAMP_PAGES = [
  'dashboard', 'families', 'assignments', 'teams',
  'budget', 'itinerary', 'communicate', 'reports', 'forms',
] as const
```

Add these new types at the end of the file (after `CommunicationLogEntry`):

```typescript
export type FormFieldType = 'text' | 'textarea' | 'checkbox' | 'radio' | 'dropdown' | 'date'

export type FormType =
  | 'liability_waiver'
  | 'medical_authorization'
  | 'photo_consent'
  | 'code_of_conduct'
  | 'background_check_consent'
  | 'custom'

export type FormAudience = 'registrant' | 'volunteer' | 'staff'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  required: boolean
  options?: string[]    // for radio and dropdown fields only
  placeholder?: string  // for text and textarea
}

export interface FormTemplate {
  id: string
  name: string
  form_type: FormType
  audience: FormAudience
  fields: FormField[]
  version: number       // incremented on save; starts at 1
  created_at: string
  updated_at?: string
}

export interface EventFormAssignment {
  id: string
  template_id: string
  template_name: string
  template_version: number
  fields_snapshot: FormField[]  // copy of fields at assignment time
  audience: FormAudience
  required: boolean
  created_at: string
}

export interface SignedForm {
  id: string
  assignment_id: string
  template_id: string
  template_version: number
  template_name: string
  responses: Record<string, string | boolean | string[]>  // fieldId → answer
  signature_name: string   // typed full legal name
  signer_ip: string        // client IP from x-forwarded-for
  signed_at: string        // ISO timestamp
  created_at: string
}
```

- [ ] **Step 4: Add `sendFormSignedConfirmation` to `lib/email.ts`**

Append to `lib/email.ts`:

```typescript
interface FormSignedConfirmationParams {
  to: string
  firstName: string
  formName: string
  campName: string
  orgName: string
  signedAt: string
  fromDisplayName?: string
  replyTo?: string
}

export async function sendFormSignedConfirmation(
  params: FormSignedConfirmationParams
): Promise<void> {
  const from = params.fromDisplayName
    ? `"${params.fromDisplayName}" <${FROM_EMAIL}>`
    : FROM_EMAIL

  await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject: `Form signed — ${params.formName} (${params.campName})`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:8px">Form signed</h1>
        <p style="color:#4C1D95;font-size:16px;margin-bottom:24px">
          Hi ${params.firstName}, your electronic signature has been recorded for
          <strong>${params.formName}</strong> — ${params.campName} at ${params.orgName}.
        </p>
        <p style="color:#64748B;font-size:13px;margin-bottom:8px">
          Signed: ${new Date(params.signedAt).toLocaleString()}
        </p>
        <p style="color:#64748B;font-size:12px;margin-top:24px">
          This is a record of your electronic signature under the E-SIGN Act.
          Your signature is legally binding.
        </p>
      </div>
    `,
  })
}
```

- [ ] **Step 5: Create `actions/forms.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { headers } from 'next/headers'
import { sendFormSignedConfirmation } from '@/lib/email'
import type { FormTemplate, EventFormAssignment, SignedForm } from '@/lib/types'
import { randomBytes } from 'crypto'

function templatesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('form_templates')
}

function assignmentsRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('form_assignments')
}

function signedFormsRef(orgId: string, campId: string, familyId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('families').doc(familyId).collection('signed_forms')
}

export interface CreateFormTemplateInput {
  name: string
  formType: FormTemplate['form_type']
  audience: FormTemplate['audience']
  fields: FormTemplate['fields']
}

export async function listFormTemplates(orgId: string): Promise<FormTemplate[]> {
  const snap = await templatesRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as FormTemplate)
}

export async function createFormTemplate(
  orgId: string,
  input: CreateFormTemplateInput
): Promise<FormTemplate> {
  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()
  const template: FormTemplate = {
    id,
    name: input.name,
    form_type: input.formType,
    audience: input.audience,
    fields: input.fields,
    version: 1,
    created_at: now,
  }
  await templatesRef(orgId).doc(id).set(template)
  return template
}

export async function updateFormTemplate(
  orgId: string,
  templateId: string,
  updates: Partial<Pick<FormTemplate, 'name' | 'form_type' | 'audience' | 'fields'>>
): Promise<void> {
  await templatesRef(orgId).doc(templateId).update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
}

export async function deleteFormTemplate(orgId: string, templateId: string): Promise<void> {
  await templatesRef(orgId).doc(templateId).delete()
}

export async function listEventFormAssignments(
  orgId: string,
  campId: string
): Promise<EventFormAssignment[]> {
  const snap = await assignmentsRef(orgId, campId).orderBy('created_at', 'asc').get()
  return snap.docs.map((d) => d.data() as EventFormAssignment)
}

export async function assignFormToEvent(
  orgId: string,
  campId: string,
  template: FormTemplate,
  required = true
): Promise<EventFormAssignment> {
  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()
  const assignment: EventFormAssignment = {
    id,
    template_id: template.id,
    template_name: template.name,
    template_version: template.version,
    fields_snapshot: template.fields,
    audience: template.audience,
    required,
    created_at: now,
  }
  await assignmentsRef(orgId, campId).doc(id).set(assignment)
  return assignment
}

export async function removeFormAssignment(
  orgId: string,
  campId: string,
  assignmentId: string
): Promise<void> {
  await assignmentsRef(orgId, campId).doc(assignmentId).delete()
}

export async function getSignedForms(
  orgId: string,
  campId: string,
  familyId: string
): Promise<SignedForm[]> {
  const snap = await signedFormsRef(orgId, campId, familyId).orderBy('signed_at', 'desc').get()
  return snap.docs.map((d) => d.data() as SignedForm)
}

export interface SubmitSignedFormInput {
  assignmentId: string
  templateId: string
  templateVersion: number
  templateName: string
  responses: Record<string, string | boolean | string[]>
  signatureName: string
  signerEmail: string
  signerFirstName: string
  campName: string
  orgName: string
  orgSlug: string
  campSlug: string
  fromDisplayName?: string
  replyTo?: string
}

export async function submitSignedForm(
  orgId: string,
  campId: string,
  familyId: string,
  input: SubmitSignedFormInput
): Promise<SignedForm> {
  const headersList = await headers()
  const signerIp =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'

  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()

  const signed: SignedForm = {
    id,
    assignment_id: input.assignmentId,
    template_id: input.templateId,
    template_version: input.templateVersion,
    template_name: input.templateName,
    responses: input.responses,
    signature_name: input.signatureName,
    signer_ip: signerIp,
    signed_at: now,
    created_at: now,
  }

  await signedFormsRef(orgId, campId, familyId).doc(id).set(signed)

  await sendFormSignedConfirmation({
    to: input.signerEmail,
    firstName: input.signerFirstName,
    formName: input.templateName,
    campName: input.campName,
    orgName: input.orgName,
    signedAt: now,
    fromDisplayName: input.fromDisplayName,
    replyTo: input.replyTo,
  })

  return signed
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run __tests__/actions/forms.test.ts
```

Expected: PASS — 7 tests

- [ ] **Step 7: Run full suite + tsc**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all pass, tsc clean.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/email.ts actions/forms.ts "__tests__/actions/forms.test.ts"
git commit -m "feat: form templates, event assignments, signed forms types + server actions"
```

---

## Task 2: Form template builder (org admin)

**Files:**
- Create: `app/(admin)/[orgSlug]/forms/page.tsx`
- Create: `components/admin/FormTemplatesClient.tsx`
- Modify: `components/layout/AdminSidebar.tsx`

No unit tests — UI calling already-tested actions.

- [ ] **Step 1: Create `app/(admin)/[orgSlug]/forms/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { listFormTemplates } from '@/actions/forms'
import { FormTemplatesClient } from '@/components/admin/FormTemplatesClient'
import type { Org } from '@/lib/types'

export default async function OrgFormsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const org = orgSnap.docs[0].data() as Org
  const orgId = orgSnap.docs[0].id

  const templates = await listFormTemplates(orgId)

  return (
    <FormTemplatesClient
      orgId={orgId}
      orgName={org.name}
      templates={templates}
    />
  )
}
```

- [ ] **Step 2: Create `components/admin/FormTemplatesClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createFormTemplate, updateFormTemplate, deleteFormTemplate } from '@/actions/forms'
import type { FormTemplate, FormField, FormFieldType, FormType, FormAudience } from '@/lib/types'

interface FormTemplatesClientProps {
  orgId: string
  orgName: string
  templates: FormTemplate[]
}

const FORM_TYPE_LABELS: Record<FormType, string> = {
  liability_waiver: 'Liability Waiver',
  medical_authorization: 'Medical Authorization',
  photo_consent: 'Photo / Media Consent',
  code_of_conduct: 'Code of Conduct',
  background_check_consent: 'Background Check Consent',
  custom: 'Custom Form',
}

const AUDIENCE_LABELS: Record<FormAudience, string> = {
  registrant: 'Registrant / Parent',
  volunteer: 'Volunteer',
  staff: 'Staff',
}

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  checkbox: 'Checkbox (yes/no)',
  radio: 'Multiple choice',
  dropdown: 'Dropdown',
  date: 'Date',
}

function emptyField(): FormField {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'text',
    label: '',
    required: false,
  }
}

export function FormTemplatesClient({ orgId, templates: initialTemplates }: FormTemplatesClientProps) {
  const [templates, setTemplates] = useState<FormTemplate[]>(initialTemplates)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New template form state
  const [newName, setNewName] = useState('')
  const [newFormType, setNewFormType] = useState<FormType>('liability_waiver')
  const [newAudience, setNewAudience] = useState<FormAudience>('registrant')
  const [newFields, setNewFields] = useState<FormField[]>([emptyField()])

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editFormType, setEditFormType] = useState<FormType>('liability_waiver')
  const [editAudience, setEditAudience] = useState<FormAudience>('registrant')
  const [editFields, setEditFields] = useState<FormField[]>([])

  function startEdit(t: FormTemplate) {
    setEditingId(t.id)
    setEditName(t.name)
    setEditFormType(t.form_type)
    setEditAudience(t.audience)
    setEditFields(t.fields.map((f) => ({ ...f })))
    setError(null)
  }

  function updateField(fields: FormField[], index: number, patch: Partial<FormField>): FormField[] {
    return fields.map((f, i) => (i === index ? { ...f, ...patch } : f))
  }

  function removeField(fields: FormField[], index: number): FormField[] {
    return fields.filter((_, i) => i !== index)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const template = await createFormTemplate(orgId, {
        name: newName.trim(),
        formType: newFormType,
        audience: newAudience,
        fields: newFields.filter((f) => f.label.trim()),
      })
      setTemplates((prev) => [template, ...prev])
      setCreating(false)
      setNewName('')
      setNewFields([emptyField()])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit(templateId: string) {
    setSaving(true)
    setError(null)
    try {
      await updateFormTemplate(orgId, templateId, {
        name: editName.trim(),
        form_type: editFormType,
        audience: editAudience,
        fields: editFields.filter((f) => f.label.trim()),
      })
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId
            ? { ...t, name: editName.trim(), form_type: editFormType, audience: editAudience, fields: editFields.filter((f) => f.label.trim()) }
            : t
        )
      )
      setEditingId(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(templateId: string) {
    setSaving(true)
    try {
      await deleteFormTemplate(orgId, templateId)
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  function FieldEditor({
    fields,
    onChange,
  }: {
    fields: FormField[]
    onChange: (fields: FormField[]) => void
  }) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fields</p>
        {fields.map((field, i) => (
          <div key={field.id} className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Label</Label>
                <Input
                  value={field.label}
                  onChange={(e) => onChange(updateField(fields, i, { label: e.target.value }))}
                  placeholder="e.g. Do you consent to..."
                  className="h-7 text-sm"
                />
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-xs">Type</Label>
                <select
                  className="w-full h-7 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={field.type}
                  onChange={(e) => onChange(updateField(fields, i, { type: e.target.value as FormFieldType, options: undefined }))}
                >
                  {Object.entries(FIELD_TYPE_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>{lbl}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => onChange(updateField(fields, i, { required: e.target.checked }))}
                    className="w-3 h-3"
                  />
                  Req
                </label>
              </div>
              <div className="flex items-end pb-0.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => onChange(removeField(fields, i))}
                  disabled={fields.length <= 1}
                >
                  ✕
                </Button>
              </div>
            </div>
            {(field.type === 'radio' || field.type === 'dropdown') && (
              <div className="space-y-1">
                <Label className="text-xs">Options (one per line)</Label>
                <textarea
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-[60px] resize-y"
                  value={(field.options ?? []).join('\n')}
                  onChange={(e) =>
                    onChange(updateField(fields, i, {
                      options: e.target.value.split('\n').filter(Boolean),
                    }))
                  }
                  placeholder="Option 1&#10;Option 2&#10;Option 3"
                />
              </div>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...fields, emptyField()])}
        >
          + Add field
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Form Templates</h1>
        {!creating && (
          <Button onClick={() => { setCreating(true); setError(null) }}>
            New template
          </Button>
        )}
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Create form */}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New form template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="newName">Template name</Label>
              <Input id="newName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. 2026 Liability Waiver" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="newFormType">Form type</Label>
                <select id="newFormType" className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={newFormType} onChange={(e) => setNewFormType(e.target.value as FormType)}>
                  {Object.entries(FORM_TYPE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="newAudience">Required from</Label>
                <select id="newAudience" className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={newAudience} onChange={(e) => setNewAudience(e.target.value as FormAudience)}>
                  {Object.entries(AUDIENCE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </div>
            </div>
            <FieldEditor fields={newFields} onChange={setNewFields} />
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving || !newName.trim()}>
                {saving ? 'Saving…' : 'Save template'}
              </Button>
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template list */}
      {templates.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">No form templates yet. Create one above to get started.</p>
      ) : (
        <div className="space-y-3">
          {templates.map((t) =>
            editingId === t.id ? (
              <Card key={t.id}>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-1">
                    <Label>Template name</Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Form type</Label>
                      <select className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={editFormType} onChange={(e) => setEditFormType(e.target.value as FormType)}>
                        {Object.entries(FORM_TYPE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Required from</Label>
                      <select className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={editAudience} onChange={(e) => setEditAudience(e.target.value as FormAudience)}>
                        {Object.entries(AUDIENCE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                      </select>
                    </div>
                  </div>
                  <FieldEditor fields={editFields} onChange={setEditFields} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSaveEdit(t.id)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card key={t.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{t.name}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline">{FORM_TYPE_LABELS[t.form_type]}</Badge>
                        <Badge variant="secondary">{AUDIENCE_LABELS[t.audience]}</Badge>
                        <span className="text-xs text-muted-foreground">{t.fields.length} fields</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(t)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)} disabled={saving}>Delete</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add "Forms" to camp nav and "Form Templates" to org nav in `components/layout/AdminSidebar.tsx`**

In `getCampNav`, add `{ key: 'forms', label: 'Forms' }` after `communicate`:

```typescript
function getCampNav(terminology: Terminology) {
  return [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'families', label: terminology.registrantPlural },
    { key: 'assignments', label: terminology.assignmentPlural },
    { key: 'teams', label: 'Teams' },
    { key: 'budget', label: 'Budget' },
    { key: 'itinerary', label: 'Itinerary' },
    { key: 'communicate', label: 'Communicate' },
    { key: 'forms', label: 'Forms' },          // ← add
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ]
}
```

In the org-level bottom `<div>`, add a "Form Templates" link after Members:

```tsx
<Link href={`/${orgSlug}/forms`} className={navClass(`/${orgSlug}/forms`)}>
  Form Templates
</Link>
```

- [ ] **Step 4: Run tsc + full suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: tsc clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add \
  "app/(admin)/[orgSlug]/forms/page.tsx" \
  components/admin/FormTemplatesClient.tsx \
  components/layout/AdminSidebar.tsx
git commit -m "feat: org-level form template builder — create/edit/delete form templates with field editor"
```

---

## Task 3: Event form assignment admin page

**Files:**
- Create: `app/(admin)/[orgSlug]/[campSlug]/forms/page.tsx`
- Create: `components/admin/EventFormsClient.tsx`

No unit tests — UI calling already-tested actions.

The event forms page shows:
- Org templates that can be assigned to this event
- Already-assigned forms with a button to remove
- Signing status: how many registrants have signed each form

- [ ] **Step 1: Create `app/(admin)/[orgSlug]/[campSlug]/forms/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { cache } from 'react'
import { adminDb } from '@/lib/firebase-admin'
import { listFormTemplates, listEventFormAssignments } from '@/actions/forms'
import { getAdminFamilies } from '@/actions/admin-families'
import { EventFormsClient } from '@/components/admin/EventFormsClient'
import type { Camp, Org } from '@/lib/types'

const resolveIds = cache(async (orgSlug: string, campSlug: string) => {
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const org = orgSnap.docs[0].data() as Org

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').where('slug', '==', campSlug).limit(1).get()
  if (campSnap.empty) notFound()

  return { orgId, org, campId: campSnap.docs[0].id, camp: campSnap.docs[0].data() as Camp }
})

export default async function EventFormsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId } = await resolveIds(orgSlug, campSlug)

  const [templates, assignments, families] = await Promise.all([
    listFormTemplates(orgId),
    listEventFormAssignments(orgId, campId),
    getAdminFamilies(orgId, campId),
  ])

  // Count signed forms per assignment
  const signedCountsByAssignment = new Map<string, number>()
  await Promise.all(
    assignments.map(async (a) => {
      // Count how many families have signed this specific assignment
      const snap = await adminDb
        .collectionGroup('signed_forms')
        .where('assignment_id', '==', a.id)
        .get()
      signedCountsByAssignment.set(a.id, snap.size)
    })
  )

  const activeCount = families.filter(
    (f) => f.registration_status === 'confirmed' || f.registration_status === 'pending'
  ).length

  return (
    <EventFormsClient
      orgId={orgId}
      campId={campId}
      templates={templates}
      assignments={assignments}
      signedCounts={Object.fromEntries(signedCountsByAssignment)}
      activeRegistrantCount={activeCount}
    />
  )
}
```

- [ ] **Step 2: Create `components/admin/EventFormsClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { assignFormToEvent, removeFormAssignment } from '@/actions/forms'
import type { FormTemplate, EventFormAssignment } from '@/lib/types'

interface EventFormsClientProps {
  orgId: string
  campId: string
  templates: FormTemplate[]
  assignments: EventFormAssignment[]
  signedCounts: Record<string, number>
  activeRegistrantCount: number
}

const AUDIENCE_LABELS: Record<string, string> = {
  registrant: 'Registrant / Parent',
  volunteer: 'Volunteer',
  staff: 'Staff',
}

export function EventFormsClient({
  orgId,
  campId,
  templates,
  assignments: initialAssignments,
  signedCounts,
  activeRegistrantCount,
}: EventFormsClientProps) {
  const [assignments, setAssignments] = useState<EventFormAssignment[]>(initialAssignments)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assignedTemplateIds = new Set(assignments.map((a) => a.template_id))
  const unassigned = templates.filter((t) => !assignedTemplateIds.has(t.id))

  async function handleAssign(template: FormTemplate) {
    setSaving(true)
    setError(null)
    try {
      const assignment = await assignFormToEvent(orgId, campId, template)
      setAssignments((prev) => [...prev, assignment])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(assignmentId: string) {
    setSaving(true)
    setError(null)
    try {
      await removeFormAssignment(orgId, campId, assignmentId)
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Forms</h1>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Assigned forms */}
      <section>
        <h2 className="text-base font-semibold mb-3">Assigned to this event</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No forms assigned yet. Add one from the list below.
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => {
              const signedCount = signedCounts[a.id] ?? 0
              return (
                <Card key={a.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{a.template_name}</p>
                        <div className="flex gap-2 items-center">
                          <Badge variant="secondary">{AUDIENCE_LABELS[a.audience] ?? a.audience}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {signedCount} / {activeRegistrantCount} signed
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRemove(a.id)}
                        disabled={saving}
                      >
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Available templates to assign */}
      {unassigned.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Available templates</h2>
          <div className="space-y-2">
            {unassigned.map((t) => (
              <Card key={t.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{t.name}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline">{t.fields.length} fields</Badge>
                        <Badge variant="secondary">{AUDIENCE_LABELS[t.audience] ?? t.audience}</Badge>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleAssign(t)} disabled={saving}>
                      Assign
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No form templates found for your org.{' '}
          <a href="../forms" className="text-primary underline">Create templates</a> at the org level first.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run tsc + full suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: tsc clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add \
  "app/(admin)/[orgSlug]/[campSlug]/forms/page.tsx" \
  components/admin/EventFormsClient.tsx
git commit -m "feat: event-level form assignment admin page — assign/remove forms, show signing status"
```

---

## Task 4: Registrant form-filling portal

**Files:**
- Create: `app/(registrant)/[orgSlug]/[campSlug]/forms/[assignmentId]/page.tsx`
- Modify: `app/(registrant)/[orgSlug]/[campSlug]/my-registration/page.tsx`

The form-filling page shows:
- Form title and all fields rendered dynamically by type
- A "Electronic Signature" section at the bottom (always present, regardless of fields)
- Submit button that calls `submitSignedForm` server action

- [ ] **Step 1: Create `app/(registrant)/[orgSlug]/[campSlug]/forms/[assignmentId]/page.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { getOrgBySlug } from '@/actions/orgs'
import { getCampBySlug } from '@/actions/camps'
import { listEventFormAssignments, getSignedForms, submitSignedForm } from '@/actions/forms'
import { getRegistrationByToken } from '@/actions/registrations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EventFormAssignment, Family, FormField, Org, Camp } from '@/lib/types'

export default function FormFillPage() {
  const { orgSlug, campSlug, assignmentId } = useParams<{
    orgSlug: string
    campSlug: string
    assignmentId: string
  }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState<EventFormAssignment | null>(null)
  const [family, setFamily] = useState<Family | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [camp, setCamp] = useState<Camp | null>(null)
  const [alreadySigned, setAlreadySigned] = useState(false)
  const [responses, setResponses] = useState<Record<string, string | boolean | string[]>>({})
  const [signatureName, setSignatureName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const o = await getOrgBySlug(orgSlug)
      if (!o) return
      const c = await getCampBySlug(o.id, campSlug)
      if (!c) return
      setOrg(o)
      setCamp(c)

      const [assignments, f] = await Promise.all([
        listEventFormAssignments(o.id, c.id),
        token ? getRegistrationByToken(o.id, c.id, token) : Promise.resolve(null),
      ])

      const a = assignments.find((x) => x.id === assignmentId)
      if (!a) return
      setAssignment(a)
      setFamily(f)

      if (f) {
        const signed = await getSignedForms(o.id, c.id, f.id)
        setAlreadySigned(signed.some((s) => s.assignment_id === assignmentId))
      }

      setLoading(false)
    }
    load()
  }, [orgSlug, campSlug, assignmentId, token])

  function setResponse(fieldId: string, value: string | boolean | string[]) {
    setResponses((prev) => ({ ...prev, [fieldId]: value }))
  }

  function renderField(field: FormField) {
    const value = responses[field.id]
    switch (field.type) {
      case 'text':
        return (
          <div key={field.id} className="space-y-1">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              value={(value as string) ?? ''}
              onChange={(e) => setResponse(field.id, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        )
      case 'textarea':
        return (
          <div key={field.id} className="space-y-1">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <textarea
              id={field.id}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-[80px] resize-y"
              value={(value as string) ?? ''}
              onChange={(e) => setResponse(field.id, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </div>
        )
      case 'checkbox':
        return (
          <div key={field.id} className="flex items-start gap-2">
            <input
              type="checkbox"
              id={field.id}
              checked={(value as boolean) ?? false}
              onChange={(e) => setResponse(field.id, e.target.checked)}
              className="mt-0.5 w-4 h-4"
              required={field.required}
            />
            <Label htmlFor={field.id} className="font-normal leading-snug">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
          </div>
        )
      case 'radio':
        return (
          <fieldset key={field.id} className="space-y-2">
            <legend className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </legend>
            {(field.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm font-normal">
                <input
                  type="radio"
                  name={field.id}
                  value={opt}
                  checked={(value as string) === opt}
                  onChange={() => setResponse(field.id, opt)}
                  className="w-4 h-4"
                />
                {opt}
              </label>
            ))}
          </fieldset>
        )
      case 'dropdown':
        return (
          <div key={field.id} className="space-y-1">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <select
              id={field.id}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={(value as string) ?? ''}
              onChange={(e) => setResponse(field.id, e.target.value)}
              required={field.required}
            >
              <option value="">— Select —</option>
              {(field.options ?? []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )
      case 'date':
        return (
          <div key={field.id} className="space-y-1">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="date"
              value={(value as string) ?? ''}
              onChange={(e) => setResponse(field.id, e.target.value)}
              required={field.required}
            />
          </div>
        )
      default:
        return null
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!assignment || !family || !org || !camp) return
    if (!signatureName.trim()) {
      setError('Please type your full name as your electronic signature.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await submitSignedForm(org.id, camp.id, family.id, {
        assignmentId: assignment.id,
        templateId: assignment.template_id,
        templateVersion: assignment.template_version,
        templateName: assignment.template_name,
        responses,
        signatureName: signatureName.trim(),
        signerEmail: family.email,
        signerFirstName: family.first_name,
        campName: camp.name,
        orgName: org.name,
        orgSlug: org.slug,
        campSlug: camp.slug,
        fromDisplayName: camp.from_display_name,
        replyTo: camp.reply_to_email,
      })
      router.push(`/${orgSlug}/${campSlug}/my-registration${token ? `?token=${token}` : ''}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Loading form…</div>
  if (!assignment) return <div className="text-sm text-muted-foreground py-8 text-center">Form not found.</div>

  if (alreadySigned) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-[#4C1D95]">{assignment.template_name}</h1>
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
          <p className="font-semibold text-green-800">You have already signed this form.</p>
          <p className="text-sm text-green-700 mt-1">A confirmation was sent to your email.</p>
        </div>
        <Button variant="outline" className="w-full" onClick={() => router.back()}>
          Back to my registration
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#4C1D95]">{assignment.template_name}</h1>
        <p className="text-sm text-gray-500 mt-1">{camp?.name} · {org?.name}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-[#DDD6FE] p-5 space-y-5">
          {assignment.fields_snapshot.map(renderField)}
        </div>

        {/* Electronic signature section */}
        <div className="bg-white rounded-xl border border-[#DDD6FE] p-5 space-y-3">
          <h2 className="font-semibold text-gray-700">Electronic Signature</h2>
          <p className="text-xs text-gray-500">
            By typing your full name below, you agree that your electronic signature is legally
            binding under the E-SIGN Act, with the same force and effect as a handwritten signature.
          </p>
          <div className="space-y-1">
            <Label htmlFor="signatureName">Type your full legal name</Label>
            <Input
              id="signatureName"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              placeholder="Your full name"
              required
              className="font-medium"
            />
          </div>
        </div>

        <div aria-live="polite" aria-atomic="true">
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <Button
          type="submit"
          className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]"
          disabled={submitting || !signatureName.trim()}
        >
          {submitting ? 'Signing…' : 'Sign and submit'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Update `app/(registrant)/[orgSlug]/[campSlug]/my-registration/page.tsx`**

Add a "Required forms" section that shows assigned forms with signing status. The page needs to also fetch form assignments and which ones the family has signed.

Add these imports at the top:
```tsx
import { listEventFormAssignments, getSignedForms } from '@/actions/forms'
```

After `const members = await getFamilyMembers(...)`, add:
```tsx
const [formAssignments, signedForms] = await Promise.all([
  listEventFormAssignments(org.id, camp.id),
  getSignedForms(org.id, camp.id, family.id),
])
const signedAssignmentIds = new Set(signedForms.map((s) => s.assignment_id))
const registrantForms = formAssignments.filter((a) => a.audience === 'registrant')
```

Add a "Required forms" section before the Edit registration button:
```tsx
{registrantForms.length > 0 && (
  <div className="bg-white rounded-xl border border-[#DDD6FE] p-5">
    <h2 className="font-semibold text-gray-700 mb-3">Required forms</h2>
    <ul className="space-y-2">
      {registrantForms.map((form) => {
        const signed = signedAssignmentIds.has(form.id)
        return (
          <li key={form.id} className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{form.template_name}</span>
            {signed ? (
              <span className="text-xs text-green-700 font-medium">✓ Signed</span>
            ) : (
              <a
                href={`/${orgSlug}/${campSlug}/forms/${form.id}${token ? `?token=${token}` : ''}`}
                className="text-xs text-[#7C3AED] font-medium hover:underline"
              >
                Sign now
              </a>
            )}
          </li>
        )
      })}
    </ul>
  </div>
)}
```

- [ ] **Step 3: Run tsc + full suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: tsc clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add \
  "app/(registrant)/[orgSlug]/[campSlug]/forms/[assignmentId]/page.tsx" \
  "app/(registrant)/[orgSlug]/[campSlug]/my-registration/page.tsx"
git commit -m "feat: registrant form-filling portal — fill and e-sign forms, confirmation email sent"
```

---

## Self-Review Checklist

After all tasks, run:

```bash
npx vitest run
npx tsc --noEmit
```

**Spec coverage check:**
- [x] Form template builder at org level — Task 2
- [x] Event-level form assignment — Task 3
- [x] Form types: liability_waiver, medical_authorization, photo_consent, code_of_conduct, background_check_consent, custom — Task 1 (`FormType` union)
- [x] Field types: text, textarea, checkbox, radio, dropdown, date — Task 1 (`FormFieldType` union)
- [x] Audience targeting: registrant, volunteer, staff — Task 1 (`FormAudience`)
- [x] Digital signature: typed full name + timestamp + IP — Tasks 1 + 4
- [x] Signed copy emailed to signer — Tasks 1 + 4 (`sendFormSignedConfirmation`)
- [x] Signed form stored write-once in Firestore — Task 1 (`submitSignedForm` only calls `.set()`, never `.update()` or `.delete()`)

**Deferred (noted in plan header):**
- File upload field type (GCS required)
- PDF snapshot generation
- GCS WORM storage
- Form versioning UI
- Dietary/allergy report generation

**Type consistency:**
- `FormTemplate.fields: FormField[]` defined Task 1, used in Tasks 2 + 3 + 4
- `EventFormAssignment.fields_snapshot: FormField[]` defined Task 1, rendered in Task 4
- `submitSignedForm(orgId, campId, familyId, input: SubmitSignedFormInput)` defined Task 1, called in Task 4
- `listEventFormAssignments` defined Task 1, called in Tasks 3 + 4
- `getSignedForms(orgId, campId, familyId)` defined Task 1, called in Tasks 3 (via admin) + 4 + my-registration
