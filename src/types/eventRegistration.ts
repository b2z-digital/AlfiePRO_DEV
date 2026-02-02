export type RegistrationType = 'member' | 'guest';

export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled' | 'waitlist';

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'pay_at_event' | 'waived';

export type PaymentMethod = 'online' | 'pay_at_event' | 'cash' | 'bank_transfer' | 'waived';

export interface EventRegistration {
  id: string;
  event_id: string;
  user_id?: string;
  club_id: string;

  registration_type: RegistrationType;
  status: RegistrationStatus;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;

  amount_paid: number;
  entry_fee_amount?: number;
  stripe_payment_id?: string;
  stripe_checkout_session_id?: string;

  // Guest registration fields
  guest_first_name?: string;
  guest_last_name?: string;
  guest_email?: string;
  guest_phone?: string;
  guest_club_name?: string;
  guest_country?: string;
  guest_state?: string;

  // Boat details
  boat_name?: string;
  sail_number?: string;
  boat_class?: string;
  boat_registration_no?: string;
  is_personal_sail_number?: boolean;

  // Additional fields
  notes?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;

  created_at: string;
  updated_at: string;
}

export type TransactionPaymentMethod = 'stripe' | 'cash' | 'bank_transfer' | 'other';

export type TransactionPaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface EventPaymentTransaction {
  id: string;
  registration_id: string;
  club_id: string;

  amount: number;
  currency: string;
  payment_method: TransactionPaymentMethod;
  payment_status: TransactionPaymentStatus;

  stripe_payment_intent_id?: string;
  stripe_charge_id?: string;

  transaction_date: string;
  notes?: string;
  created_at: string;
}

export interface EventRegistrationFormData {
  // User or Guest
  registration_type: RegistrationType;
  user_id?: string;

  // Guest details
  guest_first_name?: string;
  guest_last_name?: string;
  guest_email?: string;
  guest_phone?: string;
  guest_club_name?: string;
  guest_country?: string;
  guest_state?: string;

  // Boat details
  boat_name?: string;
  sail_number?: string;
  boat_class?: string;
  boat_registration_no?: string;
  is_personal_sail_number?: boolean;

  // Payment
  payment_method?: PaymentMethod;

  // Additional
  notes?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

export interface PublicEventRegistrationData extends EventRegistrationFormData {
  event_id: string;
  club_id: string;
  entry_fee_amount: number;
}
