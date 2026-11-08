/**
 * GST helpers shared by the transaction import and the Edit transaction sheet.
 * Rates are stored as fractions (0.1 = 10%). Amounts follow the expense/deposit
 * pages: "included" keeps the amount and works out the GST inside it;
 * "excluded" adds GST on top, and the saved amount is the total.
 */

export type TaxType = 'none' | 'included' | 'excluded';

export interface TaxRateLike {
  id: string;
  name: string;
  rate: number | string;
  is_default?: boolean | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function rateOf(r?: TaxRateLike | null): number {
  const n = Number(r?.rate);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The rate an import should use: the default one, else GST, else the first */
export function pickDefaultRate<T extends TaxRateLike>(rates: T[]): T | null {
  if (!rates.length) return null;
  return rates.find((r) => r.is_default) || rates.find((r) => /gst/i.test(r.name)) || rates[0];
}

/**
 * @param amount what the person entered (gross when included, net when excluded)
 * @returns the amount to save and the GST in it
 */
export function computeTax(amount: number, type: TaxType, rate: number): { total: number; tax: number } {
  if (!rate || type === 'none') return { total: round2(amount), tax: 0 };
  if (type === 'included') return { total: round2(amount), tax: round2(amount - amount / (1 + rate)) };
  const tax = round2(amount * rate);
  return { total: round2(amount + tax), tax };
}

/**
 * Reads a CSV "Tax" cell. Accepts "Tax Included" / "Tax Excluded" / "No Tax"
 * and the usual spellings (incl, inc GST, GST inclusive, excl, plus GST, GST free,
 * exempt, N/A, blank), or a GST dollar amount (taken as GST included in the Amount).
 * Returns null when the value can't be understood.
 */
export function parseTaxCell(raw: unknown): { type: TaxType; amount?: number } | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v || /^(none|no|n\/?a|nil|-|0|0\.0+|\$0(\.0+)?)$/.test(v) || /no tax|no gst|free|exempt|bas excluded|not reportable/.test(v)) {
    return { type: 'none' };
  }
  if (/excl|exclusive|plus|\+\s*gst|added|on top|^ex\b/.test(v)) return { type: 'excluded' };
  if (/incl|inclusive|^inc\b|^gst$|^yes$|^y$|^tax$|gst on /.test(v)) return { type: 'included' };
  const num = parseFloat(v.replace(/[^0-9.-]/g, ''));
  if (/^[$\s]*-?[\d,]*\.?\d+\s*$/.test(v) && Number.isFinite(num)) {
    return num === 0 ? { type: 'none' } : { type: 'included', amount: Math.abs(round2(num)) };
  }
  return null;
}

/** The payment methods each table accepts (club transactions are constrained) */
export const CLUB_PAYMENT_METHODS = ['cash', 'card', 'cheque', 'bank', 'other'] as const;

export function normalisePaymentMethod(raw: unknown, isAssociation: boolean): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return isAssociation ? 'other' : 'cash';
  if (/cash/.test(v)) return 'cash';
  if (/cheque|check/.test(v)) return 'cheque';
  if (/stripe/.test(v)) return isAssociation ? 'stripe' : 'card';
  if (/debit\s*card|eftpos/.test(v)) return isAssociation ? 'debit_card' : 'card';
  if (/card|credit|visa|master|amex|square|paypal/.test(v)) return isAssociation ? 'credit_card' : 'card';
  if (/bank|transfer|eft|direct|deposit|bpay|osko|payid|online/.test(v)) return isAssociation ? 'bank_transfer' : 'bank';
  return 'other';
}

/**
 * Reads a CSV date as a calendar date (YYYY-MM-DD) without time-zone drift.
 * Slashed or dashed day-first dates (15/01/2026) are read the Australian way.
 */
export function parseImportDate(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const ok = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return ok(y, +m[2], +m[1]);
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = v.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-,]+(\d{4})$/);
  if (m) {
    const mi = months.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return ok(+m[3], mi + 1, +m[1]);
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())) return ok(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return null;
}
