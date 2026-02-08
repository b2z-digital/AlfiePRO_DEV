/**
 * Hook to determine the current organization context and fetch related club IDs
 * for State/National Associations
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';

export type OrganizationContextType = 'club' | 'state' | 'national';

interface OrganizationContext {
  type: OrganizationContextType;
  clubId: string | null;
  stateAssociationId: string | null;
  nationalAssociationId: string | null;
  /** List of club IDs under this organization (for associations) */
  clubIds: string[];
  isLoading: boolean;
}

/**
 * Hook that provides organization context for widgets
 * Returns club IDs to query data from
 */
export const useOrganizationContext = (): OrganizationContext => {
  const { currentClub, currentOrganization } = useAuth();
  const [clubIds, setClubIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadClubIds();
  }, [currentClub, currentOrganization]);

  const loadClubIds = async () => {
    setIsLoading(true);

    try {
      // If viewing as a club, just return that club ID
      if (!currentOrganization || currentOrganization.type === 'club') {
        if (currentClub?.clubId) {
          setClubIds([currentClub.clubId]);
        } else {
          setClubIds([]);
        }
        setIsLoading(false);
        return;
      }

      // If viewing as a State Association, fetch all clubs in that state
      if (currentOrganization.type === 'state') {
        const { data: clubs, error } = await supabase
          .from('clubs')
          .select('id')
          .eq('state_association_id', currentOrganization.id);

        if (error) throw error;

        const ids = clubs?.map(c => c.id) || [];
        setClubIds(ids);
        setIsLoading(false);
        return;
      }

      // If viewing as a National Association, fetch all clubs under all state associations
      if (currentOrganization.type === 'national') {
        // First, get all state associations under this national association
        const { data: stateAssociations, error: stateError } = await supabase
          .from('state_associations')
          .select('id')
          .eq('national_association_id', currentOrganization.id);

        if (stateError) throw stateError;

        const stateIds = stateAssociations?.map(s => s.id) || [];

        if (stateIds.length === 0) {
          setClubIds([]);
          setIsLoading(false);
          return;
        }

        // Then, get all clubs under those state associations
        const { data: clubs, error: clubError } = await supabase
          .from('clubs')
          .select('id')
          .in('state_association_id', stateIds);

        if (clubError) throw clubError;

        const ids = clubs?.map(c => c.id) || [];
        setClubIds(ids);
        setIsLoading(false);
        return;
      }

    } catch (error) {
      console.error('Error loading club IDs for organization context:', error);
      setClubIds([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine context type
  let type: OrganizationContextType = 'club';
  if (currentOrganization?.type === 'state') {
    type = 'state';
  } else if (currentOrganization?.type === 'national') {
    type = 'national';
  }

  return {
    type,
    clubId: currentClub?.clubId || null,
    stateAssociationId: currentOrganization?.type === 'state' ? currentOrganization.id : null,
    nationalAssociationId: currentOrganization?.type === 'national' ? currentOrganization.id : null,
    clubIds,
    isLoading
  };
};

/**
 * Helper function to get the appropriate label for the context
 */
export const getContextLabel = (type: OrganizationContextType): string => {
  switch (type) {
    case 'state':
      return 'State';
    case 'national':
      return 'National';
    case 'club':
    default:
      return 'Club';
  }
};
