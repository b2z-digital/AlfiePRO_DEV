import React, { useState, useEffect } from 'react';
import { Camera, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../utils/supabase';
import CoverImageUploadModal from './CoverImageUploadModal';
import { CustomizableDashboard } from './dashboard/CustomizableDashboard';

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
  const { isNationalAdmin } = usePermissions();
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
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!nationalAssociation) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-slate-400">No national association found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Cover Image Section */}
      <div className="relative w-full h-[300px] bg-slate-800 overflow-hidden">
        {nationalAssociation.cover_image_url ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src={nationalAssociation.cover_image_url}
                alt="Cover"
                className="absolute min-w-full min-h-full"
                style={{
                  transform: `translate(${nationalAssociation.cover_image_position_x || 0}px, ${nationalAssociation.cover_image_position_y || 0}px) scale(${nationalAssociation.cover_image_scale || 1})`,
                  transformOrigin: 'center',
                }}
              />
            </div>
            <div className="absolute inset-0 bg-black opacity-10" />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-slate-800 to-slate-700" />
        )}

        <div className="absolute top-4 right-4 flex items-center gap-2">
          <a
            href={`/national-association/${nationalAssociation.id}/public`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg backdrop-blur-sm transition-all flex items-center gap-2"
          >
            <Globe className="w-5 h-5" />
            <span className="hidden sm:inline">View Public Website</span>
          </a>
          {isNationalAdmin && (
            <button
              onClick={() => setShowCoverImageModal(true)}
              className="p-3 bg-slate-900 bg-opacity-70 hover:bg-opacity-90 text-white rounded-lg backdrop-blur-sm transition-all flex items-center gap-2"
            >
              <Camera className="w-5 h-5" />
              <span className="hidden sm:inline">{nationalAssociation.cover_image_url ? 'Change Cover' : 'Add Cover'}</span>
            </button>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent p-4 sm:p-8 lg:p-16">
          <div className="flex items-center gap-3 sm:gap-4">
            {nationalAssociation.logo_url && (
              <img
                src={nationalAssociation.logo_url}
                alt={nationalAssociation.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover bg-white/10 backdrop-blur-sm border-2 border-white/20"
              />
            )}
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-1">
                {nationalAssociation.name}
              </h1>
              <p className="text-sm sm:text-base text-slate-300">
                Advanced Principal Race Officer & Association Management System
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Customizable Dashboard */}
      <div className="p-4 sm:p-6 lg:p-16">
        <CustomizableDashboard />
      </div>

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
    </div>
  );
};
