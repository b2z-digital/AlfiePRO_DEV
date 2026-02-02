/**
 * Country Flags Utility
 * Converts ISO 3166-1 alpha-2 country codes to flag emojis
 */

// Map of common country codes to country names
export const COUNTRY_NAMES: Record<string, string> = {
  'AU': 'Australia',
  'NZ': 'New Zealand',
  'GB': 'Great Britain',
  'US': 'United States',
  'CA': 'Canada',
  'FR': 'France',
  'DE': 'Germany',
  'IT': 'Italy',
  'ES': 'Spain',
  'NL': 'Netherlands',
  'BE': 'Belgium',
  'SE': 'Sweden',
  'NO': 'Norway',
  'DK': 'Denmark',
  'FI': 'Finland',
  'IE': 'Ireland',
  'PT': 'Portugal',
  'GR': 'Greece',
  'CH': 'Switzerland',
  'AT': 'Austria',
  'PL': 'Poland',
  'CZ': 'Czech Republic',
  'HU': 'Hungary',
  'RO': 'Romania',
  'BG': 'Bulgaria',
  'HR': 'Croatia',
  'SI': 'Slovenia',
  'SK': 'Slovakia',
  'EE': 'Estonia',
  'LV': 'Latvia',
  'LT': 'Lithuania',
  'JP': 'Japan',
  'CN': 'China',
  'KR': 'South Korea',
  'TW': 'Taiwan',
  'HK': 'Hong Kong',
  'SG': 'Singapore',
  'MY': 'Malaysia',
  'TH': 'Thailand',
  'ID': 'Indonesia',
  'PH': 'Philippines',
  'VN': 'Vietnam',
  'IN': 'India',
  'PK': 'Pakistan',
  'BD': 'Bangladesh',
  'LK': 'Sri Lanka',
  'BR': 'Brazil',
  'AR': 'Argentina',
  'CL': 'Chile',
  'MX': 'Mexico',
  'CO': 'Colombia',
  'PE': 'Peru',
  'VE': 'Venezuela',
  'UY': 'Uruguay',
  'EC': 'Ecuador',
  'BO': 'Bolivia',
  'PY': 'Paraguay',
  'ZA': 'South Africa',
  'EG': 'Egypt',
  'MA': 'Morocco',
  'KE': 'Kenya',
  'NG': 'Nigeria',
  'GH': 'Ghana',
  'TN': 'Tunisia',
  'DZ': 'Algeria',
  'IL': 'Israel',
  'TR': 'Turkey',
  'SA': 'Saudi Arabia',
  'AE': 'United Arab Emirates',
  'QA': 'Qatar',
  'KW': 'Kuwait',
  'BH': 'Bahrain',
  'OM': 'Oman',
  'JO': 'Jordan',
  'LB': 'Lebanon',
  'RU': 'Russia',
  'UA': 'Ukraine',
};

/**
 * Converts an ISO 3166-1 alpha-2 country code to a flag emoji
 * @param countryCode - Two-letter country code (e.g., 'AU', 'US', 'GB')
 * @returns Flag emoji string
 */
export function getCountryFlag(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) {
    return '';
  }

  // Convert country code to uppercase
  const code = countryCode.toUpperCase();

  // Convert to regional indicator symbols (flag emoji)
  // Regional indicator symbols range from U+1F1E6 (A) to U+1F1FF (Z)
  const codePoints = [...code].map(char =>
    0x1F1E6 + char.charCodeAt(0) - 'A'.charCodeAt(0)
  );

  return String.fromCodePoint(...codePoints);
}

/**
 * Gets the country name from a country code
 * @param countryCode - Two-letter country code
 * @returns Country name or the code itself if not found
 */
export function getCountryName(countryCode: string | null | undefined): string {
  if (!countryCode) return '';
  const code = countryCode.toUpperCase();
  return COUNTRY_NAMES[code] || code;
}

/**
 * Combines flag emoji and country name
 * @param countryCode - Two-letter country code
 * @returns String with flag emoji and country name (e.g., "🇦🇺 Australia")
 */
export function getFlagWithCountryName(countryCode: string | null | undefined): string {
  if (!countryCode) return '';
  const flag = getCountryFlag(countryCode);
  const name = getCountryName(countryCode);
  return flag ? `${flag} ${name}` : name;
}

/**
 * Map of ISO 3166-1 alpha-2 codes to IOC 3-letter codes
 * Used for displaying country codes in sailing competitions
 */
export const IOC_CODES: Record<string, string> = {
  'AU': 'AUS',
  'NZ': 'NZL',
  'GB': 'GBR',
  'US': 'USA',
  'CA': 'CAN',
  'FR': 'FRA',
  'DE': 'GER',
  'IT': 'ITA',
  'ES': 'ESP',
  'NL': 'NED',
  'BE': 'BEL',
  'SE': 'SWE',
  'NO': 'NOR',
  'DK': 'DEN',
  'FI': 'FIN',
  'IE': 'IRL',
  'PT': 'POR',
  'GR': 'GRE',
  'CH': 'SUI',
  'AT': 'AUT',
  'PL': 'POL',
  'CZ': 'CZE',
  'HU': 'HUN',
  'RO': 'ROU',
  'BG': 'BUL',
  'HR': 'CRO',
  'SI': 'SLO',
  'SK': 'SVK',
  'EE': 'EST',
  'LV': 'LAT',
  'LT': 'LTU',
  'JP': 'JPN',
  'CN': 'CHN',
  'KR': 'KOR',
  'TW': 'TPE',
  'HK': 'HKG',
  'SG': 'SGP',
  'MY': 'MAS',
  'TH': 'THA',
  'ID': 'INA',
  'PH': 'PHI',
  'VN': 'VIE',
  'IN': 'IND',
  'PK': 'PAK',
  'BD': 'BAN',
  'LK': 'SRI',
  'BR': 'BRA',
  'AR': 'ARG',
  'CL': 'CHI',
  'MX': 'MEX',
  'CO': 'COL',
  'PE': 'PER',
  'VE': 'VEN',
  'UY': 'URU',
  'EC': 'ECU',
  'BO': 'BOL',
  'PY': 'PAR',
  'ZA': 'RSA',
  'EG': 'EGY',
  'MA': 'MAR',
  'KE': 'KEN',
  'NG': 'NGR',
  'GH': 'GHA',
  'TN': 'TUN',
  'DZ': 'ALG',
  'IL': 'ISR',
  'TR': 'TUR',
  'SA': 'KSA',
  'AE': 'UAE',
  'QA': 'QAT',
  'KW': 'KUW',
  'BH': 'BRN',
  'OM': 'OMA',
  'JO': 'JOR',
  'LB': 'LIB',
  'RU': 'RUS',
  'UA': 'UKR',
};

/**
 * Gets the 3-letter IOC country code
 * @param countryCode - Two-letter ISO country code
 * @returns 3-letter IOC code (e.g., 'AUS', 'USA', 'GBR')
 */
export function getIOCCode(countryCode: string | null | undefined): string {
  if (!countryCode) return '';
  const code = countryCode.toUpperCase();
  return IOC_CODES[code] || code;
}

/**
 * List of common sailing nations with their codes
 */
export const SAILING_NATIONS = [
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'GB', name: 'Great Britain' },
  { code: 'US', name: 'United States' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'CA', name: 'Canada' },
  { code: 'BR', name: 'Brazil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'SG', name: 'Singapore' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'IE', name: 'Ireland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GR', name: 'Greece' },
  { code: 'TR', name: 'Turkey' },
  { code: 'HR', name: 'Croatia' },
  { code: 'PL', name: 'Poland' },
  { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'HU', name: 'Hungary' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'IN', name: 'India' },
  { code: 'MX', name: 'Mexico' },
  { code: 'CL', name: 'Chile' },
  { code: 'PE', name: 'Peru' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'IL', name: 'Israel' },
  { code: 'AE', name: 'United Arab Emirates' },
].sort((a, b) => a.name.localeCompare(b.name));
