export interface UserSubscription {
  id: string;
  user_id: string;
  subscription_type: 'club' | 'state_association' | 'national_association';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  status: 'pending' | 'active' | 'inactive' | 'cancelled' | 'past_due';
  current_period_end?: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionTier {
  id: 'club' | 'state_association' | 'national_association';
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  stripePriceId: string;
}