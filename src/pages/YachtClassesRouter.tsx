import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { YachtClassesPage } from './YachtClassesPage';
import { BoatClassManagement } from '../components/BoatClassManagement';
import { supabase } from '../utils/supabase';

interface YachtClassesRouterProps {
  darkMode: boolean;
}

export const YachtClassesRouter: React.FC<YachtClassesRouterProps> = ({ darkMode }) => {
  const { user, isNationalOrgAdmin, isStateOrgAdmin, currentClub, isSuperAdmin } = useAuth();
  const [nationalAssociationId, setNationalAssociationId] = useState<string | null>(null);
  const [nationalAssociationName, setNationalAssociationName] = useState<string | null>(null);
  const [stateAssociationId, setStateAssociationId] = useState<string | null>(null);
  const [stateAssociationName, setStateAssociationName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAssociationData();
  }, [user, currentClub]);

  const loadAssociationData = async () => {
    console.log('YachtClassesRouter: Loading association data', {
      user: user?.id,
      isNationalOrgAdmin,
      isStateOrgAdmin,
      currentClub: currentClub?.clubName,
      currentClubOrgType: currentClub?.organization_type
    });

    if (!user) {
      console.log('YachtClassesRouter: No user, setting loading to false');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // First check if the current club IS a national or state association
      // This handles superadmins viewing association dashboards
      if (currentClub) {
        console.log('YachtClassesRouter: Checking current club organization type');

        if (currentClub.organization_type === 'national_association' && (isSuperAdmin || isNationalOrgAdmin)) {
          console.log('YachtClassesRouter: Current club is a national association');
          // Get the national association details
          const { data: nationalData, error: nationalError } = await supabase
            .from('national_associations')
            .select('id, name')
            .eq('id', currentClub.clubId)
            .single();

          if (!nationalError && nationalData) {
            setNationalAssociationId(nationalData.id);
            setNationalAssociationName(nationalData.name);
            console.log('YachtClassesRouter: Set national association from current club', nationalData);
            setLoading(false);
            return;
          }
        }

        if (currentClub.organization_type === 'state_association' && (isSuperAdmin || isStateOrgAdmin)) {
          console.log('YachtClassesRouter: Current club is a state association');
          // Get the state association details
          const { data: stateData, error: stateError } = await supabase
            .from('state_associations')
            .select('id, name')
            .eq('id', currentClub.clubId)
            .single();

          if (!stateError && stateData) {
            setStateAssociationId(stateData.id);
            setStateAssociationName(stateData.name);
            console.log('YachtClassesRouter: Set state association from current club', stateData);
            setLoading(false);
            return;
          }
        }
      }

      // Check if user is a national admin
      if (isNationalOrgAdmin) {
        console.log('YachtClassesRouter: User is national admin, fetching data');
        const { data: nationalData, error: nationalError } = await supabase
          .from('user_national_associations')
          .select(`
            national_association_id,
            role,
            national_associations (
              id,
              name
            )
          `)
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .single();

        console.log('YachtClassesRouter: National data response', { nationalData, nationalError });

        if (!nationalError && nationalData) {
          const na = nationalData.national_associations as any;
          setNationalAssociationId(na.id);
          setNationalAssociationName(na.name);
          console.log('YachtClassesRouter: Set national association', { id: na.id, name: na.name });
        }
      }

      // Check if user is a state admin
      if (isStateOrgAdmin && !nationalAssociationId) {
        console.log('YachtClassesRouter: User is state admin, fetching data');
        const { data: stateData, error: stateError } = await supabase
          .from('user_state_associations')
          .select(`
            state_association_id,
            role,
            state_associations (
              id,
              name
            )
          `)
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .single();

        console.log('YachtClassesRouter: State data response', { stateData, stateError });

        if (!stateError && stateData) {
          const sa = stateData.state_associations as any;
          setStateAssociationId(sa.id);
          setStateAssociationName(sa.name);
          console.log('YachtClassesRouter: Set state association', { id: sa.id, name: sa.name });
        }
      }
    } catch (error) {
      console.error('YachtClassesRouter: Error loading association data:', error);
    } finally {
      console.log('YachtClassesRouter: Loading complete, setting loading to false');
      setLoading(false);
    }
  };

  if (loading) {
    console.log('YachtClassesRouter: Rendering loading state');
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show National Association boat class management
  if (nationalAssociationId && nationalAssociationName) {
    console.log('YachtClassesRouter: Rendering BoatClassManagement for national association');
    return (
      <BoatClassManagement
        darkMode={darkMode}
        associationType="national"
        associationId={nationalAssociationId}
        associationName={nationalAssociationName}
      />
    );
  }

  // Show State Association boat class management
  if (stateAssociationId && stateAssociationName) {
    console.log('YachtClassesRouter: Rendering BoatClassManagement for state association');
    return (
      <BoatClassManagement
        darkMode={darkMode}
        associationType="state"
        associationId={stateAssociationId}
        associationName={stateAssociationName}
      />
    );
  }

  // Show Club yacht classes page (default for regular users)
  console.log('YachtClassesRouter: Rendering YachtClassesPage (club view)');
  return <YachtClassesPage darkMode={darkMode} />;
};
