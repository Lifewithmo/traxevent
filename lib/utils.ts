import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Display rounding for all ops money (margins, costs). Storage stays float dollars. */
export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`
}
