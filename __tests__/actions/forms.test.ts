import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
  assertCampPage: vi.fn().mockResolvedValue({ role: 'admin', camp_access: {} }),
}))

vi.mock('@/lib/auth/family-access', () => ({ assertFamilyAccess: vi.fn().mockResolvedValue({ id: 'fam' }) }))

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
vi.mock('@/actions/domains', () => ({ getVerifiedSendingDomain: vi.fn().mockResolvedValue(undefined) }))

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

  it('creates template without fields when empty array provided', async () => {
    await createFormTemplate('org-1', {
      name: 'Empty Form',
      formType: 'custom',
      audience: 'volunteer',
      fields: [],
    })
    expect(templateDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Empty Form', fields: [] })
    )
  })
})

describe('updateFormTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates fields and sets updated_at', async () => {
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

  it('creates an assignment with a fields snapshot', async () => {
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
    await submitSignedForm('org-1', 'camp-1', 'fam-1', {
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
