import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../utils/supabase';
import CoverImageUploadModal from './CoverImageUploadModal';
import { AssociationDashboardShell } from './dashboard/AssociationDashboardShell';
import AlfieLoader from './brand/AlfieLoader';

interface NationalAssociationDashboardProps {
  darkMode: boolean;
}

interface NationalAssociationData {
  id: string;
  name: string;
  logo_url: string | null;
  cover_image_url: string | null;
  country: string;
  cover_image_position_x?: number;
  cover_image_position_y?: number;
  cover_image_scale?: number;
}

export const NationalAssociationDashboard: React.FC<NationalAssociationDashboardProps> = ({ darkMode }) => {
  const { user, isSuperAdmin } = useAuth();
  const { isNationalAdmin, canEditDashboard } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [nationalAssociation, setNationalAssociation] = useState<NationalAssociationData | null>(null);
  const [showCoverImageModal, setShowCoverImageModal] = useState(false);

  useEffect(() => {
    loadNationalAssociationData();
  }, [user]);

  const loadNationalAssociationData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data: userNationalAssoc, error: userNationalError } = await supabase
        .from('user_national_associations')
        .select(`
          national_association_id,
          role,
          national_associations (
            id,
            name,
            country,
            logo_url,
            cover_image_url,
            cover_image_position_x,
            cover_image_position_y,
            cover_image_scale
          )
        `)
        .eq('user_id', user.id)
        .single();

      if (userNationalError) throw userNationalError;

      const nationalAssocData = (userNationalAssoc as any).national_associations;
      setNationalAssociation(nationalAssocData);

    } catch (error) {
      console.error('Error loading national association data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCoverImage = async (file: File, position: { x: number; y: number; scale: number }) => {
    if (!nationalAssociation) {
      throw new Error('No national association selected');
    }

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `national-associations/${nationalAssociation.id}/cover-${Date.now()}.${fileExt}`;

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
        .from('national_associations')
        .update({
          cover_image_url: publicUrl,
          cover_image_position_x: position.x,
          cover_image_position_y: position.y,
          cover_image_scale: position.scale
        })
        .eq('id', nationalAssociation.id);

      if (updateError) throw updateError;

      setNationalAssociation({
        ...nationalAssociation,
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

  if (!nationalAssociation) {
    return (
      <div className="a-card a-empty m-6 py-16 px-6">
        <div className="a-display a-ink text-lg font-semibold">No national association found</div>
        <p className="a-mute m-0 text-sm">Switch to another club or association from the menu.</p>
      </div>
    );
  }

  return (
    <>
      <AssociationDashboardShell
        kind="national"
        name={nationalAssociation.name}
        logoUrl={nationalAssociation.logo_url}
        cover={{
          url: nationalAssociation.cover_image_url,
          x: nationalAssociation.cover_image_position_x,
          y: nationalAssociation.cover_image_position_y,
          scale: nationalAssociation.cover_image_scale,
        }}
        publicUrl={`/national-association/${nationalAssociation.id}/public`}
        firstName={(user as any)?.firstName}
        canChangeCover={!!isNationalAdmin}
        canCustomise={!!canEditDashboard}
        onChangeCover={() => setShowCoverImageModal(true)}
      />

      {/* Cover Image Modal */}
      {showCoverImageModal && (
        <CoverImageUploadModal
          isOpen={showCoverImageModal}
          onClose={() => setShowCoverImageModal(false)}
          currentImageUrl={nationalAssociation.cover_image_url || undefined}
          currentPosition={{
            x: nationalAssociation.cover_image_position_x || 0,
            y: nationalAssociation.cover_image_position_y || 0,
            scale: nationalAssociation.cover_image_scale || 1
          }}
          onSave={handleSaveCoverImage}
        />
      )}
    </>
  );
};
