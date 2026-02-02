import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, UserCheck, DollarSign, Check, FileText, ChevronRight, LogIn, Anchor, Globe } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { getCountryFlag } from '../../utils/countryFlags';

interface EventRegistrationModalProps {
  darkMode: boolean;
  eventId: string;
  clubId: string;
  eventName: string;
  entryFee: number;
  currency?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type TabType = 'personal' | 'boat' | 'indemnity';

const AUSTRALIAN_STATES = [
  'Australian Capital Territory',
  'New South Wales',
  'Northern Territory',
  'Queensland',
  'South Australia',
  'Tasmania',
  'Victoria',
  'Western Australia'
];

const STATE_ABBREVIATIONS: { [key: string]: string } = {
  'ACT': 'Australian Capital Territory',
  'NSW': 'New South Wales',
  'NT': 'Northern Territory',
  'QLD': 'Queensland',
  'SA': 'South Australia',
  'TAS': 'Tasmania',
  'VIC': 'Victoria',
  'WA': 'Western Australia'
};

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain',
  'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria',
  'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark',
  'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador',
  'Equatorial Guinea', 'Eritrea', 'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala',
  'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hong Kong', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati',
  'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia',
  'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique',
  'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua',
  'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan',
  'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
  'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis',
  'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino',
  'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles',
  'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
  'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan',
  'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania',
  'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
  'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City',
  'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
];

// Helper function to get country code from country name
const getCountryCode = (countryName: string): string => {
  const countryCodeMap: Record<string, string> = {
    'Australia': 'AUS',
    'New Zealand': 'NZL',
    'United Kingdom': 'GBR',
    'United States': 'USA',
    'Canada': 'CAN',
    'Afghanistan': 'AFG',
    'Albania': 'ALB',
    'Algeria': 'DZA',
    'Andorra': 'AND',
    'Angola': 'AGO',
    'Argentina': 'ARG',
    'Armenia': 'ARM',
    'Austria': 'AUT',
    'Azerbaijan': 'AZE',
    'Bahamas': 'BHS',
    'Bahrain': 'BHR',
    'Bangladesh': 'BGD',
    'Barbados': 'BRB',
    'Belarus': 'BLR',
    'Belgium': 'BEL',
    'Belize': 'BLZ',
    'Benin': 'BEN',
    'Bhutan': 'BTN',
    'Bolivia': 'BOL',
    'Brazil': 'BRA',
    'Brunei': 'BRN',
    'Bulgaria': 'BGR',
    'Cambodia': 'KHM',
    'Cameroon': 'CMR',
    'Chile': 'CHL',
    'China': 'CHN',
    'Colombia': 'COL',
    'Costa Rica': 'CRI',
    'Croatia': 'HRV',
    'Cuba': 'CUB',
    'Cyprus': 'CYP',
    'Czech Republic': 'CZE',
    'Denmark': 'DNK',
    'Ecuador': 'ECU',
    'Egypt': 'EGY',
    'Estonia': 'EST',
    'Ethiopia': 'ETH',
    'Fiji': 'FJI',
    'Finland': 'FIN',
    'France': 'FRA',
    'Georgia': 'GEO',
    'Germany': 'DEU',
    'Ghana': 'GHA',
    'Greece': 'GRC',
    'Grenada': 'GRD',
    'Guatemala': 'GTM',
    'Haiti': 'HTI',
    'Honduras': 'HND',
    'Hong Kong': 'HKG',
    'Hungary': 'HUN',
    'Iceland': 'ISL',
    'India': 'IND',
    'Indonesia': 'IDN',
    'Iran': 'IRN',
    'Iraq': 'IRQ',
    'Ireland': 'IRL',
    'Israel': 'ISR',
    'Italy': 'ITA',
    'Jamaica': 'JAM',
    'Japan': 'JPN',
    'Jordan': 'JOR',
    'Kazakhstan': 'KAZ',
    'Kenya': 'KEN',
    'Kuwait': 'KWT',
    'Latvia': 'LVA',
    'Lebanon': 'LBN',
    'Libya': 'LBY',
    'Lithuania': 'LTU',
    'Luxembourg': 'LUX',
    'Malaysia': 'MYS',
    'Maldives': 'MDV',
    'Mali': 'MLI',
    'Malta': 'MLT',
    'Mauritius': 'MUS',
    'Mexico': 'MEX',
    'Moldova': 'MDA',
    'Monaco': 'MCO',
    'Mongolia': 'MNG',
    'Montenegro': 'MNE',
    'Morocco': 'MAR',
    'Myanmar': 'MMR',
    'Namibia': 'NAM',
    'Nepal': 'NPL',
    'Netherlands': 'NLD',
    'Nicaragua': 'NIC',
    'Niger': 'NER',
    'Nigeria': 'NGA',
    'North Korea': 'PRK',
    'North Macedonia': 'MKD',
    'Norway': 'NOR',
    'Oman': 'OMN',
    'Pakistan': 'PAK',
    'Palestine': 'PSE',
    'Panama': 'PAN',
    'Paraguay': 'PRY',
    'Peru': 'PER',
    'Philippines': 'PHL',
    'Poland': 'POL',
    'Portugal': 'PRT',
    'Qatar': 'QAT',
    'Romania': 'ROU',
    'Russia': 'RUS',
    'Rwanda': 'RWA',
    'Samoa': 'WSM',
    'San Marino': 'SMR',
    'Saudi Arabia': 'SAU',
    'Senegal': 'SEN',
    'Serbia': 'SRB',
    'Seychelles': 'SYC',
    'Singapore': 'SGP',
    'Slovakia': 'SVK',
    'Slovenia': 'SVN',
    'Somalia': 'SOM',
    'South Africa': 'ZAF',
    'South Korea': 'KOR',
    'South Sudan': 'SSD',
    'Spain': 'ESP',
    'Sri Lanka': 'LKA',
    'Sudan': 'SDN',
    'Suriname': 'SUR',
    'Sweden': 'SWE',
    'Switzerland': 'CHE',
    'Syria': 'SYR',
    'Taiwan': 'TWN',
    'Tajikistan': 'TJK',
    'Tanzania': 'TZA',
    'Thailand': 'THA',
    'Togo': 'TGO',
    'Tonga': 'TON',
    'Tunisia': 'TUN',
    'Turkey': 'TUR',
    'Turkmenistan': 'TKM',
    'Tuvalu': 'TUV',
    'Uganda': 'UGA',
    'Ukraine': 'UKR',
    'United Arab Emirates': 'ARE',
    'Uruguay': 'URY',
    'Uzbekistan': 'UZB',
    'Vanuatu': 'VUT',
    'Venezuela': 'VEN',
    'Vietnam': 'VNM',
    'Yemen': 'YEM',
    'Zambia': 'ZMB',
    'Zimbabwe': 'ZWE'
  };
  return countryCodeMap[countryName] || countryName.substring(0, 3).toUpperCase();
};

export const EventRegistrationModal: React.FC<EventRegistrationModalProps> = ({
  darkMode,
  eventId,
  clubId,
  eventName,
  entryFee,
  currency = 'AUD',
  onClose,
  onSuccess,
}) => {
  const { user, currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [memberData, setMemberData] = useState<any>(null);
  const [loadingMemberData, setLoadingMemberData] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [selectedBoatId, setSelectedBoatId] = useState<string>('');
  const [userClubs, setUserClubs] = useState<any[]>([]);
  const [useNewBoat, setUseNewBoat] = useState(false);
  const [eventRaceClass, setEventRaceClass] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  // Lock body scroll when modal is open
  useEffect(() => {
    // Save original styles
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    // Get current scroll position
    const scrollY = window.scrollY;

    // Get scrollbar width
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    // Lock body position and prevent scroll
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    // Add padding to prevent content shift when scrollbar disappears
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Cleanup: restore original styles when modal closes
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;

      // Restore scroll position
      window.scrollTo(0, scrollY);
    };
  }, []);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    country: 'Australia',
    state: '',
    address_line1: '',
    address_line2: '',
    city: '',
    postcode: '',
    phone: '',
    email: '',
    club_name: '',
    boat_country: 'Australia', // Now uses full country name
    sail_number: '',
    boat_registration_no: '',
    design: '',
    is_personal_sail_number: false,
    payment_method: entryFee > 0 ? undefined : 'waived',
    // International competitor fields
    accept_temporary_membership: false,
    has_liability_insurance: false,
    dnm_country: '',
  });

  useEffect(() => {
    const loadMemberData = async () => {
      if (!user?.id) {
        setLoadingMemberData(false);
        return;
      }

      try {
        // Fetch event details to get race class
        const { data: eventData } = await supabase
          .from('public_events')
          .select('race_class')
          .eq('id', eventId)
          .maybeSingle();

        const raceClass = eventData?.race_class || '';
        setEventRaceClass(raceClass);

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name, email')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        // Get all clubs the user belongs to
        const { data: clubs, error: clubsError } = await supabase
          .from('user_clubs')
          .select('club_id, clubs(id, name)')
          .eq('user_id', user.id);

        if (!clubsError && clubs) {
          const clubsList = clubs.map((uc: any) => ({
            id: uc.clubs?.id,
            name: uc.clubs?.name
          })).filter((c: any) => c.id && c.name);

          setUserClubs(clubsList);
        }

        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('*, member_boats(*)')
          .eq('user_id', user.id)
          .eq('club_id', clubId)
          .maybeSingle();

        if (!memberError && member) {
          setMemberData(member);

          // Get boats and find matching boat class
          const boats = Array.isArray(member.member_boats) ? member.member_boats : [];

          // Try to find a boat that matches the event's race class
          let selectedBoat = null;
          if (raceClass) {
            selectedBoat = boats.find((b: any) =>
              b.boat_type === raceClass || b.class_name === raceClass
            );
          }

          // If no matching boat found, check if we should default to "new boat" option
          if (!selectedBoat && boats.length > 0) {
            // No matching boat class, default to new boat entry
            setUseNewBoat(true);

            // For DF65 and DF95, default the design field
            let defaultDesign = '';
            if (raceClass === 'DF65' || raceClass === 'DF95') {
              defaultDesign = raceClass;
            }

            selectedBoat = null; // Will trigger new boat form with defaults
          } else if (selectedBoat) {
            // Found a matching boat
            setSelectedBoatId(selectedBoat.id);
            setUseNewBoat(false);
          } else if (boats.length > 0) {
            // No race class specified, use primary or first boat
            selectedBoat = boats.find((b: any) => b.is_primary) || boats[0];
            setSelectedBoatId(selectedBoat.id);
            setUseNewBoat(false);
          } else {
            // No boats at all, use new boat form
            setUseNewBoat(true);
          }

          // Find the current club name from the clubs list
          const currentClubData = clubs?.find((uc: any) => uc.club_id === clubId);
          const clubName = (currentClubData as any)?.clubs?.name || member.club_name || '';

          // Convert state abbreviation to full name if needed
          const memberState = member.state || '';
          const fullStateName = STATE_ABBREVIATIONS[memberState] || memberState;

          // Determine default design for DF65/DF95
          let defaultDesign = selectedBoat?.design_name || selectedBoat?.boat_type || '';
          if (!defaultDesign && (raceClass === 'DF65' || raceClass === 'DF95')) {
            defaultDesign = raceClass;
          }

          setFormData(prev => ({
            ...prev,
            first_name: profile?.first_name || member.first_name || '',
            last_name: profile?.last_name || member.last_name || '',
            email: profile?.email || member.email || '',
            phone: member.phone || '',
            country: member.country || 'Australia',
            state: fullStateName,
            club_name: clubName,
            sail_number: selectedBoat?.sail_number || '',
            design: defaultDesign,
            boat_registration_no: selectedBoat?.hull_registration_number || '',
          }));
        }
      } catch (err) {
        console.error('Error loading member data:', err);
      } finally {
        setLoadingMemberData(false);
      }
    };

    loadMemberData();
  }, [user, clubId, currentClub]);

  const handleInputChange = (field: string, value: any) => {
    const updates: any = { [field]: value };

    // Sync boat_country when personal country changes
    if (field === 'country') {
      updates.boat_country = value;
    }

    setFormData({ ...formData, ...updates });
    // Clear error for this field when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: false }));
    }
  };

  const getFieldClassName = (fieldName: string, baseClass: string) => {
    const hasError = fieldErrors[fieldName];
    if (hasError) {
      return `${baseClass} border-red-500 focus:ring-red-500 ${darkMode ? 'border-red-500' : 'border-red-500'}`;
    }
    return baseClass;
  };

  const handleBoatSelection = (boatId: string) => {
    if (boatId === 'new_boat') {
      setUseNewBoat(true);
      setSelectedBoatId('');
      // Clear boat fields for manual entry
      setFormData(prev => ({
        ...prev,
        sail_number: '',
        design: '',
        boat_registration_no: '',
      }));
    } else {
      setUseNewBoat(false);
      setSelectedBoatId(boatId);
      const selectedBoat = memberData?.member_boats?.find((b: any) => b.id === boatId);

      if (selectedBoat) {
        setFormData(prev => ({
          ...prev,
          sail_number: selectedBoat.sail_number || '',
          design: selectedBoat.design_name || selectedBoat.boat_type || '',
          boat_registration_no: selectedBoat.hull_registration_number || '',
        }));
      }
    }
  };

  const validatePersonalTab = () => {
    const errors: Record<string, boolean> = {};
    let isValid = true;

    if (!formData.first_name?.trim()) {
      errors.first_name = true;
      isValid = false;
    }
    if (!formData.last_name?.trim()) {
      errors.last_name = true;
      isValid = false;
    }
    if (!formData.email?.trim()) {
      errors.email = true;
      isValid = false;
    }
    if (!formData.phone?.trim()) {
      errors.phone = true;
      isValid = false;
    }
    if (!formData.club_name?.trim()) {
      errors.club_name = true;
      isValid = false;
    }

    // Validate address fields based on country
    if (formData.country === 'Australia') {
      if (!formData.state?.trim()) {
        errors.state = true;
        isValid = false;
      }
    } else {
      // International address validation
      if (!formData.address_line1?.trim()) {
        errors.address_line1 = true;
        isValid = false;
      }
      if (!formData.city?.trim()) {
        errors.city = true;
        isValid = false;
      }
      if (!formData.postcode?.trim()) {
        errors.postcode = true;
        isValid = false;
      }
    }

    // International competitor requirements
    if (formData.country !== 'Australia') {
      if (!formData.accept_temporary_membership) {
        errors.accept_temporary_membership = true;
        isValid = false;
      }
      if (!formData.has_liability_insurance) {
        errors.has_liability_insurance = true;
        isValid = false;
      }
      if (!formData.dnm_country?.trim()) {
        errors.dnm_country = true;
        isValid = false;
      }
    }

    return { errors, isValid };
  };

  const validateBoatTab = () => {
    const errors: Record<string, boolean> = {};
    let isValid = true;

    if (!formData.sail_number?.trim()) {
      errors.sail_number = true;
      isValid = false;
    }
    if (!formData.boat_registration_no?.trim()) {
      errors.boat_registration_no = true;
      isValid = false;
    }

    return { errors, isValid };
  };

  const isPersonalTabValid = () => {
    const baseValid = formData.first_name?.trim() &&
                      formData.last_name?.trim() &&
                      formData.email?.trim() &&
                      formData.phone?.trim() &&
                      formData.club_name?.trim();

    if (!baseValid) return false;

    // Additional validation for Australian addresses
    if (formData.country === 'Australia') {
      return formData.state?.trim();
    }

    // Additional validation for international addresses
    const internationalValid = formData.address_line1?.trim() &&
                               formData.city?.trim() &&
                               formData.postcode?.trim() &&
                               formData.accept_temporary_membership &&
                               formData.has_liability_insurance &&
                               formData.dnm_country?.trim();

    return internationalValid;
  };

  const isBoatTabValid = () => {
    return formData.sail_number?.trim() && formData.boat_registration_no?.trim();
  };

  const handleNextTab = () => {
    if (activeTab === 'personal') {
      const validation = validatePersonalTab();
      if (!validation.isValid) {
        setFieldErrors(validation.errors);
        addNotification('Please complete all required fields', 'error');
        return;
      }
      setFieldErrors({});
      setActiveTab('boat');
    } else if (activeTab === 'boat') {
      const validation = validateBoatTab();
      if (!validation.isValid) {
        setFieldErrors(validation.errors);
        addNotification('Please complete all required fields', 'error');
        return;
      }
      setFieldErrors({});
      setActiveTab('indemnity');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.first_name || !formData.last_name || !formData.email) {
      addNotification('error', 'Please fill in all required personal information');
      setActiveTab('personal');
      return;
    }

    if (!formData.sail_number) {
      addNotification('error', 'Please provide a sail number');
      setActiveTab('boat');
      return;
    }

    if (!agreedToTerms) {
      addNotification('error', 'Please agree to the terms and conditions');
      setActiveTab('indemnity');
      return;
    }

    if (entryFee > 0 && !formData.payment_method) {
      addNotification('error', 'Please select a payment method');
      setActiveTab('indemnity');
      return;
    }

    setLoading(true);

    try {
      const registrationData = {
        event_id: eventId,
        club_id: clubId,
        registration_type: user ? 'member' : 'guest',
        user_id: user?.id || null,
        status: 'pending',
        payment_status: entryFee === 0 ? 'waived' : (formData.payment_method === 'pay_at_event' ? 'pay_at_event' : 'unpaid'),
        payment_method: formData.payment_method,
        entry_fee_amount: entryFee,
        amount_paid: 0,

        guest_first_name: !user ? formData.first_name : null,
        guest_last_name: !user ? formData.last_name : null,
        guest_email: !user ? formData.email : null,
        guest_phone: !user ? formData.phone : null,
        guest_club_name: formData.club_name,
        guest_country: formData.country,
        guest_state: formData.country === 'Australia' ? formData.state : null,
        guest_address_line1: formData.country !== 'Australia' ? formData.address_line1 : null,
        guest_address_line2: formData.country !== 'Australia' ? formData.address_line2 : null,
        guest_city: formData.country !== 'Australia' ? formData.city : null,
        guest_postcode: formData.country !== 'Australia' ? formData.postcode : null,

        boat_name: formData.design,
        sail_number: formData.sail_number,
        boat_class: formData.design,
        boat_country: getCountryCode(formData.boat_country),
        boat_registration_no: formData.boat_registration_no,
        is_personal_sail_number: formData.is_personal_sail_number,

        // International competitor fields
        accept_temporary_membership: formData.country !== 'Australia' ? formData.accept_temporary_membership : null,
        has_liability_insurance: formData.country !== 'Australia' ? formData.has_liability_insurance : null,
        dnm_country: formData.country !== 'Australia' ? formData.dnm_country : null,
      };

      // Use security definer function to bypass RLS for guest registrations
      const { data: registrationId, error: regError } = await supabase
        .rpc('create_event_registration', {
          p_event_id: registrationData.event_id,
          p_club_id: registrationData.club_id,
          p_registration_type: registrationData.registration_type,
          p_user_id: registrationData.user_id,
          p_status: registrationData.status,
          p_payment_status: registrationData.payment_status,
          p_payment_method: registrationData.payment_method,
          p_entry_fee_amount: registrationData.entry_fee_amount,
          p_amount_paid: registrationData.amount_paid,
          p_guest_first_name: registrationData.guest_first_name,
          p_guest_last_name: registrationData.guest_last_name,
          p_guest_email: registrationData.guest_email,
          p_guest_phone: registrationData.guest_phone,
          p_guest_club_name: registrationData.guest_club_name,
          p_guest_country: registrationData.guest_country,
          p_guest_state: registrationData.guest_state,
          p_guest_address_line1: registrationData.guest_address_line1,
          p_guest_address_line2: registrationData.guest_address_line2,
          p_guest_city: registrationData.guest_city,
          p_guest_postcode: registrationData.guest_postcode,
          p_boat_name: registrationData.boat_name,
          p_sail_number: registrationData.sail_number,
          p_boat_class: registrationData.boat_class,
          p_boat_country: registrationData.boat_country,
          p_boat_registration_no: registrationData.boat_registration_no,
          p_is_personal_sail_number: registrationData.is_personal_sail_number,
          p_accept_temporary_membership: registrationData.accept_temporary_membership,
          p_has_liability_insurance: registrationData.has_liability_insurance,
          p_dnm_country: registrationData.dnm_country,
        });

      if (regError) throw regError;

      const registration = { id: registrationId };

      if (formData.payment_method === 'online' && entryFee > 0) {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-event-checkout`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            registration_id: registration.id,
            event_id: eventId,
            club_id: clubId,
            amount: entryFee,
            currency: currency.toLowerCase(),
            success_url: window.location.href,
            cancel_url: window.location.href,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create payment session');
        }

        const { url } = await response.json();
        window.location.href = url;
        return;
      }

      addNotification('Registration successful!', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Registration error:', err);
      addNotification(err.message || 'Failed to register for event', 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderPersonalTab = () => (
    <div className="space-y-6">
      {/* Show login prompt for non-logged-in users */}
      {!user && (
        <div className={`p-4 rounded-lg border-2 ${darkMode ? 'bg-cyan-900/20 border-cyan-500/50' : 'bg-cyan-50 border-cyan-400'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LogIn className={darkMode ? 'text-cyan-400' : 'text-cyan-600'} size={20} />
              <div>
                <p className={`font-semibold ${darkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>
                  Already have an Alfie account?
                </p>
                <p className={`text-sm ${darkMode ? 'text-cyan-400/80' : 'text-cyan-600/80'}`}>
                  Sign in to auto-fill your details and access your boats
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/login', { state: { returnTo: window.location.pathname } });
              }}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium text-sm flex items-center gap-2"
            >
              <LogIn size={16} />
              Sign In
            </button>
          </div>
        </div>
      )}

      <div>
        <h3 className={`text-base font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
          <span className="text-red-500">*</span> Required Information
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.first_name}
              onChange={(e) => handleInputChange('first_name', e.target.value)}
              placeholder="First Name"
              className={getFieldClassName('first_name', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.last_name}
              onChange={(e) => handleInputChange('last_name', e.target.value)}
              placeholder="Last Name"
              className={getFieldClassName('last_name', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Country <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Globe size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
              <div className="absolute left-10 top-1/2 -translate-y-1/2 text-2xl z-10 pointer-events-none">
                {formData.country && getCountryFlag(getCountryCode(formData.country))}
              </div>
              <select
                value={formData.country}
                onChange={(e) => handleInputChange('country', e.target.value)}
                className={`w-full pl-20 pr-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                style={{ maxHeight: '200px' }}
              >
                {COUNTRIES.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>
          </div>

          {formData.country === 'Australia' ? (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                State <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.state}
                onChange={(e) => handleInputChange('state', e.target.value)}
                className={getFieldClassName('state', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
              >
                <option value="">Select State</option>
                {AUSTRALIAN_STATES.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
          ) : (
            <div></div>
          )}
        </div>

        {/* International Address Fields */}
        {formData.country !== 'Australia' && (
          <div className="space-y-4 mt-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.address_line1}
                onChange={(e) => handleInputChange('address_line1', e.target.value)}
                placeholder="Address"
                className={getFieldClassName('address_line1', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Address
              </label>
              <input
                type="text"
                value={formData.address_line2}
                onChange={(e) => handleInputChange('address_line2', e.target.value)}
                placeholder="Address"
                className={`w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  City/Suburb <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="City/Suburb"
                  className={getFieldClassName('city', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  State
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  placeholder="State"
                  className={`w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Post Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.postcode}
                onChange={(e) => handleInputChange('postcode', e.target.value)}
                placeholder="Post Code"
                className={getFieldClassName('postcode', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
              />
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Phone <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            required
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            placeholder="e.g., 0412 345 678"
            className={getFieldClassName('phone', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
          />
        </div>

        <div className="mt-4">
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            E-mail <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="your.email@example.com"
            className={getFieldClassName('email', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
          />
        </div>

        <div className="mt-4">
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Club <span className="text-red-500">*</span>
          </label>
          {userClubs.length > 1 ? (
            <>
              <select
                value={formData.club_name}
                onChange={(e) => handleInputChange('club_name', e.target.value)}
                className={getFieldClassName('club_name', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
              >
                <option value="">Select your club...</option>
                {userClubs.map((club: any) => (
                  <option key={club.id} value={club.name}>
                    {club.name}
                  </option>
                ))}
              </select>
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                You are a member of {userClubs.length} clubs
              </p>
            </>
          ) : (
            <input
              type="text"
              value={formData.club_name}
              onChange={(e) => handleInputChange('club_name', e.target.value)}
              placeholder="Your sailing club"
              className={getFieldClassName('club_name', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
            />
          )}
        </div>

        {/* International Competitor Requirements */}
        {formData.country !== 'Australia' && (
          <div className={`mt-6 p-6 rounded-lg border-2 ${darkMode ? 'bg-slate-800/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
            <h4 className={`text-sm font-bold mb-4 uppercase tracking-wide ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              INTERNATIONAL COMPETITORS/NON AUSTRALIAN RESIDENTS
            </h4>

            <p className={`text-sm mb-4 italic ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Refer to the Notice of Race for further information prior to completing this section.
            </p>

            <div className="space-y-4 mb-6">
              <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                a) I am a member of the DNM entered below and hereby accept to become a Temporary Affiliate Member of the Australian Radio Yachting Association for the period of this regatta in accordance with the Notice of Race
              </p>
              <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                b) I currently hold Public Liability Insurance Cover with a minimum of $20 million (AUD) per incident (or equivalent) and shall provide a copy of such cover to the Organizing Authority.
              </p>
            </div>

            <div className="space-y-4">
              <label className={`flex items-start gap-3 cursor-pointer group ${fieldErrors.accept_temporary_membership ? 'text-red-500' : ''}`}>
                <div className="relative mt-1">
                  <input
                    type="checkbox"
                    checked={formData.accept_temporary_membership}
                    onChange={(e) => handleInputChange('accept_temporary_membership', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${formData.accept_temporary_membership ? 'bg-cyan-600 border-cyan-600' : fieldErrors.accept_temporary_membership ? 'border-red-500' : darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300'}`}>
                    {formData.accept_temporary_membership && (
                      <Check size={14} className="text-white" />
                    )}
                  </div>
                </div>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  I accept Temporary Affiliate Membership (as per paragraph 'a' above) <span className="text-red-500">*</span>
                </span>
              </label>

              <label className={`flex items-start gap-3 cursor-pointer group ${fieldErrors.has_liability_insurance ? 'text-red-500' : ''}`}>
                <div className="relative mt-1">
                  <input
                    type="checkbox"
                    checked={formData.has_liability_insurance}
                    onChange={(e) => handleInputChange('has_liability_insurance', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${formData.has_liability_insurance ? 'bg-cyan-600 border-cyan-600' : fieldErrors.has_liability_insurance ? 'border-red-500' : darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300'}`}>
                    {formData.has_liability_insurance && (
                      <Check size={14} className="text-white" />
                    )}
                  </div>
                </div>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  I currently hold Public Liability Insurance Cover (as per paragraph 'b' above) <span className="text-red-500">*</span>
                </span>
              </label>
            </div>

            <div className="mt-6">
              <label className={`block text-sm font-bold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Enter your DNM Country <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.dnm_country}
                onChange={(e) => handleInputChange('dnm_country', e.target.value)}
                placeholder="Enter your DNM Country"
                className={getFieldClassName('dnm_country', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
              />
            </div>

            <div className={`mt-6 p-4 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-white'}`}>
              <p className={`text-sm italic ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                It is important that you refer to the entry payment conditions outlined in the NOR. If payment at registration is not reflected, payment by direct deposit to the bank account outlined in the NOR must be completed prior to the entry closing date.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderBoatTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className={`text-base font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
          Boat Details
        </h3>

        {/* Boat Selector for members with boats */}
        {memberData && memberData.member_boats && memberData.member_boats.length > 0 && (
          <div className="mb-6">
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Select Your Boat <span className="text-red-500">*</span>
            </label>
            <select
              value={useNewBoat ? 'new_boat' : selectedBoatId}
              onChange={(e) => handleBoatSelection(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
            >
              <option value="">Choose a boat from your garage...</option>
              {memberData.member_boats.map((boat: any) => (
                <option key={boat.id} value={boat.id}>
                  {boat.boat_type || 'Unnamed'} - Sail #{boat.sail_number} {boat.is_primary ? '(Primary)' : ''}
                </option>
              ))}
              <option value="new_boat">+ Enter a different boat</option>
            </select>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {useNewBoat
                ? 'Enter your boat details below'
                : `You have ${memberData.member_boats.length} boat${memberData.member_boats.length > 1 ? 's' : ''} in your garage`
              }
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Country <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Globe size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
              <div className="absolute left-10 top-1/2 -translate-y-1/2 text-2xl z-10 pointer-events-none">
                {formData.boat_country && getCountryFlag(getCountryCode(formData.boat_country))}
              </div>
              <select
                value={formData.boat_country}
                onChange={(e) => handleInputChange('boat_country', e.target.value)}
                className={`w-full pl-20 pr-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                style={{ maxHeight: '200px' }}
              >
                {COUNTRIES.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Sail No <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.sail_number}
              onChange={(e) => handleInputChange('sail_number', e.target.value)}
              placeholder="e.g., 123"
              disabled={loadingMemberData}
              className={getFieldClassName('sail_number', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400 disabled:bg-slate-800' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 disabled:bg-slate-100'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Boat Registration No <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.boat_registration_no}
              onChange={(e) => handleInputChange('boat_registration_no', e.target.value)}
              placeholder="eg 1754 (numeric value)"
              disabled={loadingMemberData}
              className={getFieldClassName('boat_registration_no', `w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400 disabled:bg-slate-800' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 disabled:bg-slate-100'} focus:outline-none focus:ring-2 focus:ring-cyan-500`)}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Design
            </label>
            <input
              type="text"
              value={formData.design}
              onChange={(e) => handleInputChange('design', e.target.value)}
              placeholder="e.g., Diamond, Trance, Sanga"
              disabled={loadingMemberData}
              className={`w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400 disabled:bg-slate-800' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 disabled:bg-slate-100'} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
            />
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Hull design (e.g., Diamond, Trance, Sanga)
            </p>
          </div>
        </div>

        <div className="mt-6">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={formData.is_personal_sail_number}
                onChange={(e) => handleInputChange('is_personal_sail_number', e.target.checked)}
                className="sr-only peer"
              />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${formData.is_personal_sail_number ? 'bg-cyan-600 border-cyan-600' : darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300'}`}>
                {formData.is_personal_sail_number && (
                  <Check size={14} className="text-white" />
                )}
              </div>
            </div>
            <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Personal Sail Number
            </span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderIndemnityTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className={`text-lg font-bold mb-4 text-center ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
          INDEMNITY
        </h3>

        <div className={`p-4 rounded-lg mb-4 max-h-64 overflow-y-auto ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
          <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            By submitting this online entry form, I agree to abide by the conditions of the event as contained in the
            ARYA Regatta Terms and Conditions, Notice of Race, Sailing Instructions, the Racing Rules of Sailing and
            any Notices published by the Sailing Committee.
          </p>

          <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            All entrants taking part in this event do so entirely at their own risk:
          </p>

          <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            The Australian Radio Yachting Association (Incorporated), and any other parties involved in the
            organization of this event disclaim:
          </p>

          <p className={`text-sm italic leading-relaxed mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            "Any and every responsibility whatsoever for loss, damage, injury or inconvenience that might occur to
            persons and goods, both ashore and on the water as a consequence of entering or participating in this
            event. At all times the responsibility for the safety and themselves plus the decision to participate or
            continue must rest with the competitor."
          </p>

          <p className={`text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            A competitor may only enter the event by accepting these conditions as they appear on the entry form for
            this event.
          </p>
        </div>

        <label className={`flex items-start gap-3 cursor-pointer group p-4 rounded-lg border-2 transition-all ${agreedToTerms ? darkMode ? 'bg-cyan-900/20 border-cyan-500' : 'bg-cyan-50 border-cyan-400' : darkMode ? 'bg-slate-700/50 border-slate-600 hover:border-slate-500' : 'bg-slate-50 border-slate-300 hover:border-slate-400'}`}>
          <div className="relative mt-1">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="sr-only peer"
            />
            <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${agreedToTerms ? 'bg-cyan-600 border-cyan-600' : darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300'}`}>
              {agreedToTerms && (
                <Check size={16} className="text-white" />
              )}
            </div>
          </div>
          <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            I agree to the terms and conditions outlined above <span className="text-red-500">*</span>
          </span>
        </label>

        {entryFee > 0 && (
          <div className="mt-6">
            <h4 className={`text-base font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
              Payment Method <span className="text-red-500">*</span>
            </h4>

            <div className={`mb-4 p-4 rounded-lg border ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-amber-50 border-amber-300'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Entry Fee
                </span>
                <span className={`text-2xl font-bold ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>
                  ${entryFee.toFixed(2)} {currency}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div
                onClick={() => handleInputChange('payment_method', 'online')}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${formData.payment_method === 'online' ? darkMode ? 'border-cyan-500 bg-cyan-900/20' : 'border-cyan-400 bg-cyan-50' : darkMode ? 'border-slate-600 hover:border-slate-500 bg-slate-700/30' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative mt-1">
                    <input
                      type="radio"
                      checked={formData.payment_method === 'online'}
                      onChange={() => {}}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${formData.payment_method === 'online' ? 'bg-cyan-600 border-cyan-600' : darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300'}`}>
                      {formData.payment_method === 'online' && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <DollarSign size={18} className={formData.payment_method === 'online' ? 'text-cyan-500' : darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      <h4 className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        Pay Now Online
                      </h4>
                    </div>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Secure payment via credit/debit card. Instant confirmation.
                    </p>
                  </div>
                </div>
              </div>

              <div
                onClick={() => handleInputChange('payment_method', 'pay_at_event')}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${formData.payment_method === 'pay_at_event' ? darkMode ? 'border-green-500 bg-green-900/20' : 'border-green-400 bg-green-50' : darkMode ? 'border-slate-600 hover:border-slate-500 bg-slate-700/30' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative mt-1">
                    <input
                      type="radio"
                      checked={formData.payment_method === 'pay_at_event'}
                      onChange={() => {}}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${formData.payment_method === 'pay_at_event' ? 'bg-green-600 border-green-600' : darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300'}`}>
                      {formData.payment_method === 'pay_at_event' && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className={formData.payment_method === 'pay_at_event' ? 'text-green-500' : darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      <h4 className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        Pay at Registration
                      </h4>
                    </div>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Pay with cash or card at registration desk on race day.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      style={{
        isolation: 'isolate',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflowY: 'auto'
      }}
      onClick={(e) => {
        // Close modal if clicking the backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-slideUp ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <UserCheck className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Event Registration</h2>
              <p className="text-cyan-100 text-sm mt-0.5">{eventName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        <div className={`flex border-b ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <button
            type="button"
            onClick={() => setActiveTab('personal')}
            className={`flex-1 px-6 py-4 font-medium text-sm transition-all relative ${activeTab === 'personal' ? darkMode ? 'text-cyan-400 bg-slate-700/50' : 'text-cyan-600 bg-cyan-50' : darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            Personal Information
            {activeTab === 'personal' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600"></div>
            )}
          </button>

          <button
            type="button"
            onClick={() => isPersonalTabValid() && setActiveTab('boat')}
            disabled={!isPersonalTabValid()}
            className={`flex-1 px-6 py-4 font-medium text-sm transition-all relative ${
              !isPersonalTabValid()
                ? darkMode ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 cursor-not-allowed'
                : activeTab === 'boat'
                  ? darkMode ? 'text-cyan-400 bg-slate-700/50' : 'text-cyan-600 bg-cyan-50'
                  : darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Boat Details
            {activeTab === 'boat' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600"></div>
            )}
          </button>

          <button
            type="button"
            onClick={() => isPersonalTabValid() && isBoatTabValid() && setActiveTab('indemnity')}
            disabled={!isPersonalTabValid() || !isBoatTabValid()}
            className={`flex-1 px-6 py-4 font-medium text-sm transition-all relative ${
              !isPersonalTabValid() || !isBoatTabValid()
                ? darkMode ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 cursor-not-allowed'
                : activeTab === 'indemnity'
                  ? darkMode ? 'text-cyan-400 bg-slate-700/50' : 'text-cyan-600 bg-cyan-50'
                  : darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Indemnity & Payment
            {activeTab === 'indemnity' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600"></div>
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6">
            {activeTab === 'personal' && renderPersonalTab()}
            {activeTab === 'boat' && renderBoatTab()}
            {activeTab === 'indemnity' && renderIndemnityTab()}
          </div>

          <div className={`sticky bottom-0 p-6 border-t flex justify-between gap-3 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Cancel
            </button>

            <div className="flex gap-3">
              {activeTab !== 'indemnity' && (
                <button
                  type="button"
                  onClick={handleNextTab}
                  disabled={activeTab === 'personal' ? !isPersonalTabValid() : !isBoatTabValid()}
                  className="px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-500"
                >
                  Continue
                  <ChevronRight size={18} />
                </button>
              )}

              {activeTab === 'indemnity' && (
                <button
                  type="submit"
                  disabled={loading || !agreedToTerms || (entryFee > 0 && !formData.payment_method)}
                  className="px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={18} />
                  {loading ? 'Processing...' : formData.payment_method === 'online' ? 'Proceed to Payment' : 'Complete Registration'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
