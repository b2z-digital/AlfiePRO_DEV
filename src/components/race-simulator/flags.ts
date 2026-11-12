// Country codes for the world's flags: a sail's letters to ISO alpha-2, and a country's name.
import { COUNTRY_NAMES, IOC_CODES } from '@/utils/countryFlags';

/** ISO alpha-2 from a sail's country letters (AUS → AU), or the code as it is. */
export function alpha2(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  const hit = Object.entries(IOC_CODES).find(([, ioc]) => ioc === c);
  return hit ? hit[0] : null;
}

export const countryName = (code: string | null | undefined): string => (code ? COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase() : '');
