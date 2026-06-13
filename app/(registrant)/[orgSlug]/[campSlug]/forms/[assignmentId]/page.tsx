'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
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
      if (!a) { setLoading(false); return }
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
              {field.label}{field.required && <span className="text-destructive ml-1">*</span>}
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
              {field.label}{field.required && <span className="text-destructive ml-1">*</span>}
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
            <Label htmlFor={field.id} className="font-normal leading-snug cursor-pointer">
              {field.label}{field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
          </div>
        )
      case 'radio':
        return (
          <fieldset key={field.id} className="space-y-2">
            <legend className="text-sm font-medium">
              {field.label}{field.required && <span className="text-destructive ml-1">*</span>}
            </legend>
            {(field.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm font-normal cursor-pointer">
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
              {field.label}{field.required && <span className="text-destructive ml-1">*</span>}
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
              {field.label}{field.required && <span className="text-destructive ml-1">*</span>}
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
      router.push(
        `/${orgSlug}/${campSlug}/my-registration${token ? `?token=${token}` : ''}`
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div role="status" className="text-sm text-muted-foreground py-8 text-center">Loading form…</div>
  }

  if (!assignment) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Form not found.</div>
  }

  if (!family) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-[#4C1D95]">Form not accessible</h1>
        <p className="text-sm text-gray-500">
          Please open this form using the link in your registration confirmation email.
        </p>
      </div>
    )
  }

  if (alreadySigned) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-[#4C1D95]">{assignment.template_name}</h1>
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
          <p className="font-semibold text-green-800">You have already signed this form.</p>
          <p className="text-sm text-green-700 mt-1">A confirmation was sent to your email.</p>
        </div>
        <Link href={`/${orgSlug}/${campSlug}/my-registration${token ? `?token=${token}` : ''}`}>
          <Button variant="outline" className="w-full">Back to my registration</Button>
        </Link>
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
          {assignment.fields_snapshot.length === 0 && (
            <p className="text-sm text-muted-foreground">No additional fields for this form.</p>
          )}
        </div>

        {/* Electronic signature — always present */}
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
