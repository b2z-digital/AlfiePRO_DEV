import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MembershipForm } from '../components/membership/MembershipForm';

export const MembershipPage: React.FC = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const { user, currentClub } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clubName, setClubName] = useState('');
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null);
  const [isRenewal, setIsRenewal] = useState(false);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Use the current club if no clubId is provided
        const targetClubId = clubId || currentClub?.clubId;
        
        if (!targetClubId) {
          setError('No club selected');
          return;
        }
        
        // Fetch club details - use maybeSingle() to handle cases where club is not found
        const { data: clubData, error: clubError } = await supabase
          .from('clubs')
          .select('name')
          .eq('id', targetClubId)
          .maybeSingle();
        
        if (clubError) throw clubError;
        
        if (clubData) {
          setClubName(clubData.name);
        } else {
          setError('Club not found');
          return;
        }
        
        // Check if user is already a member of this club
        if (user) {
          const { data: memberData, error: memberError } = await supabase
            .from('members')
            .select('id, is_financial, renewal_date')
            .eq('club_id', targetClubId)
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (memberError) throw memberError;
          
          if (memberData) {
            setExistingMemberId(memberData.id);
            
            // Check if this is a renewal (member exists but not financial or renewal date is past)
            const isExpired = memberData.renewal_date 
              ? new Date(memberData.renewal_date) < new Date() 
              : false;
              
            setIsRenewal(!memberData.is_financial || isExpired);
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load membership information');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [clubId, currentClub, user]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold text-white mb-2">Error</h2>
            <p className="text-red-300">{error}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-slate-300 hover:text-slate-100 bg-slate-800/30 hover:bg-slate-700/40 border border-slate-700/50"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Users className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">
                {isRenewal ? 'Membership Renewal' : 'Membership Application'}
              </h1>
              <p className="text-slate-400">{clubName}</p>
            </div>
          </div>
        </div>
        
        <MembershipForm
          clubId={clubId || currentClub?.clubId || ''}
          isRenewal={isRenewal}
          existingMemberId={existingMemberId || undefined}
          onSuccess={() => navigate('/dashboard')}
        />
      </div>
    </div>
  );
};