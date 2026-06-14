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
  return { id: crypto.randomUUID(), type: 'text', label: '', required: false }
}

function updateField(fields: FormField[], index: number, patch: Partial<FormField>): FormField[] {
  return fields.map((f, i) => (i === index ? { ...f, ...patch } : f))
}

function removeField(fields: FormField[], index: number): FormField[] {
  return fields.filter((_, i) => i !== index)
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
      {fields.map((field, i) => {
        const labelInputId = `field-label-${field.id}`
        const typeSelectId = `field-type-${field.id}`
        const optionsId = `field-options-${field.id}`
        return (
          <div key={field.id} className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor={labelInputId} className="text-xs">Label</Label>
                <Input
                  id={labelInputId}
                  value={field.label}
                  onChange={(e) => onChange(updateField(fields, i, { label: e.target.value }))}
                  placeholder="e.g. Do you consent to..."
                  className="h-7 text-sm"
                />
              </div>
              <div className="w-36 space-y-1">
                <Label htmlFor={typeSelectId} className="text-xs">Type</Label>
                <select
                  id={typeSelectId}
                  className="w-full h-7 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={field.type}
                  onChange={(e) =>
                    onChange(updateField(fields, i, { type: e.target.value as FormFieldType, options: undefined }))
                  }
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
                <Label htmlFor={optionsId} className="text-xs">Options (one per line)</Label>
                <textarea
                  id={optionsId}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-[60px] resize-y"
                  value={(field.options ?? []).join('\n')}
                  onChange={(e) =>
                    onChange(updateField(fields, i, {
                      options: e.target.value.split('\n').filter(Boolean),
                    }))
                  }
                  placeholder={`Option 1\nOption 2\nOption 3`}
                />
              </div>
            )}
            {/* Conditional visibility — show this field only when an earlier field matches */}
            {(() => {
              const earlierFields = fields.slice(0, i).filter((ef) => ef.label.trim() !== '')
              const cond = field.condition
              return (
                <div className="mt-2 rounded-md border border-dashed border-input p-2 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5"
                      checked={!!cond}
                      disabled={earlierFields.length === 0}
                      onChange={(e) =>
                        onChange(updateField(fields, i, {
                          condition: e.target.checked
                            ? { dependsOn: earlierFields[0].id, operator: 'equals', value: '' }
                            : undefined,
                        }))
                      }
                    />
                    Only show this field conditionally
                    {earlierFields.length === 0 && <span className="italic"> (needs an earlier field)</span>}
                  </label>

                  {cond && (
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        aria-label="Depends on field"
                        className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                        value={cond.dependsOn}
                        onChange={(e) => onChange(updateField(fields, i, { condition: { ...cond, dependsOn: e.target.value } }))}
                      >
                        {earlierFields.map((ef) => (
                          <option key={ef.id} value={ef.id}>{ef.label}</option>
                        ))}
                      </select>

                      <select
                        aria-label="Condition operator"
                        className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                        value={cond.operator}
                        onChange={(e) =>
                          onChange(updateField(fields, i, {
                            condition: { ...cond, operator: e.target.value as typeof cond.operator },
                          }))
                        }
                      >
                        <option value="equals">equals</option>
                        <option value="not_equals">does not equal</option>
                        <option value="is_checked">is checked</option>
                        <option value="is_not_empty">is answered</option>
                      </select>

                      {(cond.operator === 'equals' || cond.operator === 'not_equals') && (() => {
                        const dep = earlierFields.find((ef) => ef.id === cond.dependsOn)
                        const opts = dep?.options ?? []
                        return opts.length > 0 ? (
                          <select
                            aria-label="Condition value"
                            className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                            value={cond.value}
                            onChange={(e) => onChange(updateField(fields, i, { condition: { ...cond, value: e.target.value } }))}
                          >
                            <option value="">— value —</option>
                            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <Input
                            aria-label="Condition value"
                            className="h-8 text-xs"
                            value={cond.value}
                            onChange={(e) => onChange(updateField(fields, i, { condition: { ...cond, value: e.target.value } }))}
                            placeholder="value"
                          />
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )
      })}
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

export function FormTemplatesClient({ orgId, templates: initialTemplates }: FormTemplatesClientProps) {
  const [templates, setTemplates] = useState<FormTemplate[]>(initialTemplates)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newFormType, setNewFormType] = useState<FormType>('liability_waiver')
  const [newAudience, setNewAudience] = useState<FormAudience>('registrant')
  const [newFields, setNewFields] = useState<FormField[]>([emptyField()])

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
            ? {
                ...t,
                name: editName.trim(),
                form_type: editFormType,
                audience: editAudience,
                fields: editFields.filter((f) => f.label.trim()),
              }
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
    if (!confirm('Delete this template? This cannot be undone.')) return
    setSaving(true)
    setError(null)
    try {
      await deleteFormTemplate(orgId, templateId)
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  const selectClass = 'w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

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

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New form template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="newName">Template name</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. 2026 Liability Waiver"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="newFormType">Form type</Label>
                <select id="newFormType" className={selectClass} value={newFormType} onChange={(e) => setNewFormType(e.target.value as FormType)}>
                  {Object.entries(FORM_TYPE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="newAudience">Required from</Label>
                <select id="newAudience" className={selectClass} value={newAudience} onChange={(e) => setNewAudience(e.target.value as FormAudience)}>
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

      {templates.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">
          No form templates yet. Create one above.
        </p>
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
                      <select className={selectClass} value={editFormType} onChange={(e) => setEditFormType(e.target.value as FormType)}>
                        {Object.entries(FORM_TYPE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Required from</Label>
                      <select className={selectClass} value={editAudience} onChange={(e) => setEditAudience(e.target.value as FormAudience)}>
                        {Object.entries(AUDIENCE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                      </select>
                    </div>
                  </div>
                  <FieldEditor fields={editFields} onChange={setEditFields} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSaveEdit(t.id)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card key={t.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{t.name}</p>
                      <div className="flex gap-2 items-center">
                        <Badge variant="outline">{FORM_TYPE_LABELS[t.form_type]}</Badge>
                        <Badge variant="secondary">{AUDIENCE_LABELS[t.audience]}</Badge>
                        <span className="text-xs text-muted-foreground">{t.fields.length} field{t.fields.length !== 1 ? 's' : ''}</span>
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
