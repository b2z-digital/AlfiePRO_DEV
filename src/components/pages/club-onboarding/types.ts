export interface MembershipTypeEntry {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  renewal_period: 'annual' | 'monthly' | 'quarterly' | 'lifetime';
}

export interface ClubOnboardingFormData {
  name: string;
  abbreviation: string;
  location: string;
  country: string;
  email: string;
  phone: string;
  website: string;

  logoFile: File | null;
  logoPreview: string;
  clubIntroduction: string;
  featuredImageFile: File | null;
  featuredImagePreview: string;

  venueName: string;
  venueAddress: string;
  venueDescription: string;
  venueLatitude: number;
  venueLongitude: number;

  membershipTypes: MembershipTypeEntry[];

  currency: string;
  taxName: string;
  taxRate: number;
  taxEnabled: boolean;

  assignAdmin: boolean;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  sendInvitation: boolean;
}

export interface StepProps {
  formData: ClubOnboardingFormData;
  updateFormData: (updates: Partial<ClubOnboardingFormData>) => void;
  darkMode: boolean;
}

export const STEP_CONFIG = [
  { key: 'basic', label: 'Club Details', shortLabel: 'Details' },
  { key: 'branding', label: 'Branding', shortLabel: 'Branding' },
  { key: 'venue', label: 'Venue', shortLabel: 'Venue' },
  { key: 'membership', label: 'Memberships', shortLabel: 'Members' },
  { key: 'finance', label: 'Finance', shortLabel: 'Finance' },
  { key: 'admin', label: 'Club Admin', shortLabel: 'Admin' },
  { key: 'review', label: 'Review', shortLabel: 'Review' },
] as const;

export const COUNTRIES = [
  'Australia', 'New Zealand', 'United Kingdom', 'United States',
  'Canada', 'South Africa', 'Singapore', 'Hong Kong',
  'Ireland', 'Germany', 'France', 'Netherlands', 'Sweden',
  'Norway', 'Denmark', 'Japan', 'Other'
];

export const CURRENCIES = [
  { code: 'AUD', label: 'AUD - Australian Dollar', symbol: '$' },
  { code: 'NZD', label: 'NZD - New Zealand Dollar', symbol: '$' },
  { code: 'GBP', label: 'GBP - British Pound', symbol: '\u00A3' },
  { code: 'USD', label: 'USD - US Dollar', symbol: '$' },
  { code: 'CAD', label: 'CAD - Canadian Dollar', symbol: '$' },
  { code: 'EUR', label: 'EUR - Euro', symbol: '\u20AC' },
  { code: 'ZAR', label: 'ZAR - South African Rand', symbol: 'R' },
  { code: 'SGD', label: 'SGD - Singapore Dollar', symbol: '$' },
  { code: 'HKD', label: 'HKD - Hong Kong Dollar', symbol: '$' },
  { code: 'SEK', label: 'SEK - Swedish Krona', symbol: 'kr' },
  { code: 'NOK', label: 'NOK - Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', label: 'DKK - Danish Krone', symbol: 'kr' },
  { code: 'JPY', label: 'JPY - Japanese Yen', symbol: '\u00A5' },
];

export const COUNTRY_DEFAULTS: Record<string, { currency: string; taxName: string; taxRate: number }> = {
  'Australia': { currency: 'AUD', taxName: 'GST', taxRate: 10 },
  'New Zealand': { currency: 'NZD', taxName: 'GST', taxRate: 15 },
  'United Kingdom': { currency: 'GBP', taxName: 'VAT', taxRate: 20 },
  'United States': { currency: 'USD', taxName: 'Sales Tax', taxRate: 0 },
  'Canada': { currency: 'CAD', taxName: 'GST', taxRate: 5 },
  'South Africa': { currency: 'ZAR', taxName: 'VAT', taxRate: 15 },
  'Singapore': { currency: 'SGD', taxName: 'GST', taxRate: 9 },
  'Hong Kong': { currency: 'HKD', taxName: 'N/A', taxRate: 0 },
  'Ireland': { currency: 'EUR', taxName: 'VAT', taxRate: 23 },
  'Germany': { currency: 'EUR', taxName: 'VAT', taxRate: 19 },
  'France': { currency: 'EUR', taxName: 'VAT', taxRate: 20 },
  'Netherlands': { currency: 'EUR', taxName: 'VAT', taxRate: 21 },
  'Sweden': { currency: 'SEK', taxName: 'VAT', taxRate: 25 },
  'Norway': { currency: 'NOK', taxName: 'VAT', taxRate: 25 },
  'Denmark': { currency: 'DKK', taxName: 'VAT', taxRate: 25 },
  'Japan': { currency: 'JPY', taxName: 'Consumption Tax', taxRate: 10 },
};
