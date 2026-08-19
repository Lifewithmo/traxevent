//
// COLOUR RULE: permanently-white paper. Explicit var(--warm-N) only.
//
// The peak-end moment of the whole relationship (spec §4, craft lens). What
// this replaces was a Card reading "Signed." — correct, and reflectively
// empty. Every branch here states what happens next, because the customer has
// just committed money and the only question they now have is "and then what?"

export function AcceptedState({
  signerName,
  signedAt,
  depositPaid,
  eventDate,
  orgName,
}: {
  signerName: string
  signedAt?: string
  depositPaid: boolean
  eventDate?: string
  orgName?: string
}) {
  return (
    <section className="w-full px-6 py-16">
      <div className="mx-auto max-w-[68ch]">
        <h2 className="text-3xl font-bold text-[var(--warm-950)]">
          You&apos;re booked{eventDate ? ` for ${eventDate}` : ''}.
        </h2>
        <p className="mt-3 text-lg text-[var(--warm-700)]">
          Signed by <span className="font-semibold text-[var(--warm-950)]">{signerName}</span>
          {signedAt && <> on {new Date(signedAt).toLocaleDateString()}</>}.
          {depositPaid && ' Your deposit is paid.'}
        </p>

        <div data-testid="whats-next" className="mt-8 border-t border-[var(--warm-200)] pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--warm-600)]">
            What happens next
          </h3>
          <ul className="mt-3 space-y-2 text-[var(--warm-700)]">
            <li>
              {orgName ?? 'We'}&apos;ll be in touch to confirm the final details and timings.
            </li>
            <li>A copy of this signed proposal has been emailed to you for your records.</li>
            {!depositPaid && <li>We&apos;ll send the deposit request separately.</li>}
          </ul>
        </div>
      </div>
    </section>
  )
}
