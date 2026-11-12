// Country codes for the world's flags: a sail's letters to ISO alpha-2, and a country's name.
import { COUNTRY_NAMES, IOC_CODES } from '@/utils/countryFlags';

// Countries the platform's lists don't have yet (for the Circuit's cast).
const MORE_IOC: Record<string, string> = { SAM: 'WS' };
const MORE_NAMES: Record<string, string> = { WS: 'Samoa' };

/** ISO alpha-2 from a sail's country letters (AUS → AU), or the code as it is. */
export function alpha2(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  if (MORE_IOC[c]) return MORE_IOC[c];
  const hit = Object.entries(IOC_CODES).find(([, ioc]) => ioc === c);
  return hit ? hit[0] : null;
}

export const countryName = (code: string | null | undefined): string => (code ? COUNTRY_NAMES[code.toUpperCase()] ?? MORE_NAMES[code.toUpperCase()] ?? code.toUpperCase() : '');
