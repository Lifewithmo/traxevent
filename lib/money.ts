/**
 * One money formatter. `toLocaleString()` alone renders 1567.5 as "$1,567.5",
 * which is tolerable in 11px prose and wrong at 20px in a StatTile — so cents
 * are shown only when there are cents, and always as two digits.
 *
 * The playbook calls for a shared Money/Figure brick; this is its first half.
 * Other modules still carry local copies and can adopt this as they level up.
 */
export function formatMoney(n: number): string {
  const cents = Math.round(n * 100) % 100 !== 0
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`
}
