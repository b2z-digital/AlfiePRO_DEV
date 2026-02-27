import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Building, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { Logo } from '../Logo';

interface ClubApplicationPendingScreenProps {
  darkMode: boolean;
}

interface PendingClubData {
  id: string;
  name: string;
  abbreviation: string;
  approval_status: string;
  created_at: string;
  state_association_name?: string;
}

export const ClubApplicationPendingScreen: React.FC<ClubApplicationPendingScreenProps> = ({ darkMode }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [pendingClub, setPendingClub] = useState<PendingClubData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadPendingClub();
    }
  }, [user]);

  const loadPendingClub = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('clubs')
        .select(`
          id,
          name,
          abbreviation,
          approval_status,
          created_at,
          state_associations (
            name
          )
        `)
        .eq('registered_by_user_id', user.id)
        .eq('approval_status', 'pending_approval')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const assocData = data.state_associations as any;
        setPendingClub({
          id: data.id,
          name: data.name,
          abbreviation: data.abbreviation,
          approval_status: data.approval_status,
          created_at: data.created_at,
          state_association_name: assocData?.name || 'Unknown Association',
        });
      }
    } catch (error) {
      console.error('Error loading pending club:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (!pendingClub) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-300 mb-4">No pending club registration found</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const submittedDate = new Date(pendingClub.created_at).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="relative flex items-center justify-center mb-8">
          <div className="flex items-center gap-3">
            <Logo size="large" />
            <h1 className="text-3xl text-white tracking-wide">
              <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
            </h1>
          </div>
          <button
            onClick={handleSignOut}
            className="absolute right-0 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            Sign Out
          </button>
        </div>

        <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8 md:p-12">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mb-4">
                <Clock className="text-amber-500" size={32} />
              </div>
              <h2 className="text-3xl font-bold mb-2 text-white">
                Registration Pending
              </h2>
              <p className="text-lg text-slate-300">
                Your club registration is awaiting approval
              </p>
            </div>

            <div className="rounded-lg p-6 mb-6 bg-slate-700/30 backdrop-blur-sm border border-slate-600/30">
              <h3 className="text-lg font-semibold mb-4 text-slate-200">
                Club Registration Details
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">Club Name:</span>
                  <span className="font-medium text-slate-200">{pendingClub.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Abbreviation:</span>
                  <span className="font-medium text-slate-200">{pendingClub.abbreviation}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Association:</span>
                  <span className="font-medium text-slate-200">{pendingClub.state_association_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Submitted:</span>
                  <span className="font-medium text-slate-200">{submittedDate}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg p-6 mb-6 bg-slate-700/30 backdrop-blur-sm border border-slate-600/30">
              <h3 className="text-lg font-semibold mb-4 text-slate-200">
                What Happens Next?
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-emerald-500/20 text-emerald-400">
                    1
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">Association Review</p>
                    <p className="text-sm text-slate-400">
                      The {pendingClub.state_association_name} administrators will review your club registration
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-emerald-500/20 text-emerald-400">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">Approval Decision</p>
                    <p className="text-sm text-slate-400">
                      Once approved, your club dashboard will become active and ready to use
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-emerald-500/20 text-emerald-400">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">Get Started</p>
                    <p className="text-sm text-slate-400">
                      You'll be set up as the club administrator and can start managing your club immediately
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg p-4 border bg-emerald-500/10 border-emerald-500/20">
              <div className="flex items-start gap-3">
                <Building className="text-emerald-400 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-sm text-emerald-200">
                  You will receive a notification once your registration has been reviewed. This usually takes 1-2 business days.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            You'll be able to access your club dashboard once the registration is approved
          </p>
        </div>
      </div>
    </div>
  );
};
