import React, { useState } from 'react';
import { ArrowLeft, Check, Loader2, Building2, Mail, MapPin, DollarSign, CreditCard } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import type { ClubSetupData } from '../ClubSetupWizard';

interface ClubReviewStepProps {
  data: ClubSetupData;
  applicationId: string | null;
  onComplete: () => void;
  onBack: () => void;
}

export const ClubReviewStep: React.FC<ClubReviewStepProps> = ({
  data,
  applicationId,
  onComplete,
  onBack,
}) => {
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!agreed) {
      setError('Please agree to the terms and conditions');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const clubData = {
        name: data.clubInfo.name,
        abbreviation: data.clubInfo.abbreviation,
        logo: data.clubInfo.logo,
        primary_color: data.clubInfo.primaryColor || '#10b981',
        secondary_color: data.clubInfo.secondaryColor || '#3b82f6',
        description: data.clubInfo.description,
        email: data.contactInfo.email,
        phone: data.contactInfo.phone,
        address: data.contactInfo.address,
        city: data.contactInfo.city,
        state: data.contactInfo.state,
        postcode: data.contactInfo.postcode,
        country: data.contactInfo.country || 'Australia',
        website: data.contactInfo.website,
        facebook: data.contactInfo.facebook,
        instagram: data.contactInfo.instagram,
        twitter: data.contactInfo.twitter,
        tax_type: data.financialInfo.taxType,
        tax_id: data.financialInfo.taxId,
        currency: data.financialInfo.currency || 'AUD',
        created_by_user_id: user.id,
      };

      const { data: club, error: clubError } = await supabase
        .from('clubs')
        .insert(clubData)
        .select()
        .single();

      if (clubError) throw clubError;

      await supabase
        .from('user_clubs')
        .insert({
          user_id: user.id,
          club_id: club.id,
          role: 'admin',
        });

      if (data.primaryVenue.name) {
        await supabase
          .from('venues')
          .insert({
            name: data.primaryVenue.name,
            address: data.primaryVenue.address,
            latitude: data.primaryVenue.latitude,
            longitude: data.primaryVenue.longitude,
            venue_type: data.primaryVenue.venueType,
            club_id: club.id,
            is_default: true,
          });
      }

      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);

      if (applicationId) {
        await supabase
          .from('club_setup_applications')
          .update({
            club_id: club.id,
            is_draft: false,
            trial_start_date: new Date().toISOString(),
            trial_end_date: trialEndDate.toISOString(),
            completed_at: new Date().toISOString(),
          })
          .eq('id', applicationId);
      }

      const checkoutUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-alfie-checkout`;

      const response = await fetch(checkoutUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clubId: club.id,
          plan: data.subscriptionPlan || 'club',
          trialDays: 30,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();

      window.location.href = url;

    } catch (err: any) {
      console.error('Error creating club:', err);
      setError(err.message || 'Failed to complete setup. Please try again.');
      setLoading(false);
    }
  };

  const getPlanDetails = () => {
    const plans: Record<string, { name: string; price: number }> = {
      club: { name: 'Club', price: 49 },
      state: { name: 'State Association', price: 149 },
      national: { name: 'National Association', price: 399 },
    };
    return plans[data.subscriptionPlan || 'club'];
  };

  const planDetails = getPlanDetails();

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Review & Launch</h2>
      <p className="text-slate-300 mb-6">
        Review your club setup before launching. You can edit any of these details
        later from your settings.
      </p>

      <div className="space-y-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center border border-emerald-500/30">
              <Building2 className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Club Information</h3>
          </div>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-slate-400">Name:</dt>
              <dd className="font-medium text-white">{data.clubInfo.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Abbreviation:</dt>
              <dd className="font-medium text-white">{data.clubInfo.abbreviation}</dd>
            </div>
            {data.clubInfo.logo && (
              <div className="flex justify-between items-center">
                <dt className="text-slate-400">Logo:</dt>
                <dd>
                  <img src={data.clubInfo.logo} alt="Logo" className="h-16 w-16 object-cover rounded-full border-2 border-slate-600" />
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
              <Mail className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Contact Information</h3>
          </div>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-slate-400">Email:</dt>
              <dd className="font-medium text-white">{data.contactInfo.email}</dd>
            </div>
            {data.contactInfo.phone && (
              <div className="flex justify-between">
                <dt className="text-slate-400">Phone:</dt>
                <dd className="font-medium text-white">{data.contactInfo.phone}</dd>
              </div>
            )}
            {data.contactInfo.address && (
              <div className="flex justify-between">
                <dt className="text-slate-400">Address:</dt>
                <dd className="font-medium text-white text-right">
                  {data.contactInfo.address}
                  {data.contactInfo.city && `, ${data.contactInfo.city}`}
                  {data.contactInfo.state && ` ${data.contactInfo.state}`}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {data.primaryVenue.name && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center border border-purple-500/30">
                <MapPin className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Primary Venue</h3>
            </div>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-slate-400">Name:</dt>
                <dd className="font-medium text-white">{data.primaryVenue.name}</dd>
              </div>
              {data.primaryVenue.venueType && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Type:</dt>
                  <dd className="font-medium text-white">{data.primaryVenue.venueType}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center border border-green-500/30">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Financial Settings</h3>
          </div>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-slate-400">Currency:</dt>
              <dd className="font-medium text-white">{data.financialInfo.currency || 'AUD'}</dd>
            </div>
            {data.financialInfo.taxType && (
              <div className="flex justify-between">
                <dt className="text-slate-400">Tax Type:</dt>
                <dd className="font-medium text-white">{data.financialInfo.taxType.toUpperCase()}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center border border-green-500/30">
              <CreditCard className="w-5 h-5 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Subscription Plan</h3>
          </div>
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="font-semibold text-white">{planDetails.name}</p>
              <p className="text-sm text-green-400">
                ${planDetails.price}/month after trial
              </p>
            </div>
            <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
              30-DAY FREE TRIAL
            </div>
          </div>
          <p className="text-sm text-slate-300">
            You'll be redirected to enter payment details. Your card will not be
            charged until your 30-day trial ends on{' '}
            <strong className="text-green-400">
              {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
            </strong>
          </p>
        </div>

        <div className="border border-slate-700/50 rounded-xl p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm text-slate-300">
              I agree to the{' '}
              <a href="#" className="text-green-400 hover:text-green-300">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-green-400 hover:text-green-300">
                Privacy Policy
              </a>
              . I understand that I can cancel anytime during the trial period at
              no cost.
            </span>
          </label>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 hover:text-white transition-all disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || !agreed}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold transition-all transform shadow-lg bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Your Club...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Launch My Club
            </>
          )}
        </button>
      </div>
    </div>
  );
};
