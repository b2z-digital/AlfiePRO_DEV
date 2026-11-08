import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../utils/supabase';
import CoverImageUploadModal from './CoverImageUploadModal';
import { AssociationDashboardShell } from './dashboard/AssociationDashboardShell';
import AlfieLoader from './brand/AlfieLoader';

interface StateAssociationDashboardProps {
  darkMode: boolean;
}

interface StateAssociationData {
  id: string;
  name: string;
  state: string;
  logo_url: string | null;
  cover_image_url: string | null;
  cover_image_position_x?: number;
  cover_image_position_y?: number;
  cover_image_scale?: number;
}

export const StateAssociationDashboard: React.FC<StateAssociationDashboardProps> = ({ darkMode }) => {
  const { user, isSuperAdmin, currentOrganization } = useAuth();
  const { isStateAdmin, canEditDashboard } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [stateAssociation, setStateAssociation] = useState<StateAssociationData | null>(null);
  const [showCoverImageModal, setShowCoverImageModal] = useState(false);

  useEffect(() => {
    loadStateAssociationData();
  }, [user, currentOrganization]);

  const loadStateAssociationData = async () => {
    if (!user || !currentOrganization || currentOrganization.type !== 'state') return;

    try {
      setLoading(true);

      // Fetch the state association data directly using currentOrganization.id
      const { data: stateAssocData, error: stateError } = await supabase
        .from('state_associations')
        .select(`
          id,
          name,
          state,
          logo_url,
          cover_image_url,
          cover_image_position_x,
          cover_image_position_y,
          cover_image_scale
        `)
        .eq('id', currentOrganization.id)
        .maybeSingle();

      if (stateError) throw stateError;

      if (stateAssocData) {
        setStateAssociation(stateAssocData);
      }

    } catch (error) {
      console.error('Error loading state association data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCoverImage = async (file: File, position: { x: number; y: number; scale: number }) => {
    if (!stateAssociation) {
      throw new Error('No state association selected');
    }

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `state-associations/${stateAssociation.id}/cover-${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('state_associations')
        .update({
          cover_image_url: publicUrl,
          cover_image_position_x: position.x,
          cover_image_position_y: position.y,
          cover_image_scale: position.scale
        })
        .eq('id', stateAssociation.id);

      if (updateError) throw updateError;

      setStateAssociation({
        ...stateAssociation,
        cover_image_url: publicUrl,
        cover_image_position_x: position.x,
        cover_image_position_y: position.y,
        cover_image_scale: position.scale
      });

      setShowCoverImageModal(false);
    } catch (error) {
      console.error('Error uploading cover image:', error);
      throw error;
    }
  };

  if (loading) {
    return <AlfieLoader variant="page" message="Loading dashboard" />;
  }

  if (!stateAssociation) {
    return (
      <div className="a-card a-empty m-6 py-16 px-6">
        <div className="a-display a-ink text-lg font-semibold">No state association found</div>
        <p className="a-mute m-0 text-sm">Switch to another club or association from the menu.</p>
      </div>
    );
  }

  return (
    <>
      <AssociationDashboardShell
        kind="state"
        name={stateAssociation.name}
        logoUrl={stateAssociation.logo_url}
        cover={{
          url: stateAssociation.cover_image_url,
          x: stateAssociation.cover_image_position_x,
          y: stateAssociation.cover_image_position_y,
          scale: stateAssociation.cover_image_scale,
        }}
        publicUrl={`/state-association/${stateAssociation.id}/public`}
        firstName={(user as any)?.firstName}
        canChangeCover={!!isStateAdmin}
        canCustomise={!!canEditDashboard}
        onChangeCover={() => setShowCoverImageModal(true)}
      />

      {/* Cover Image Modal */}
      {showCoverImageModal && (
        <CoverImageUploadModal
          isOpen={showCoverImageModal}
          onClose={() => setShowCoverImageModal(false)}
          currentImageUrl={stateAssociation.cover_image_url || undefined}
          currentPosition={{
            x: stateAssociation.cover_image_position_x || 0,
            y: stateAssociation.cover_image_position_y || 0,
            scale: stateAssociation.cover_image_scale || 1
          }}
          onSave={handleSaveCoverImage}
        />
      )}
    </>
  );
};
