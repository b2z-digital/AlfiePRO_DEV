import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Image as ImageIcon, MoveUp, MoveDown, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { HomepageSlideModal } from './HomepageSlideModal';
import { HomepageTileModal } from './HomepageTileModal';

interface HomepageSlide {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  button_text: string;
  button_url: string;
  display_order: number;
  is_active: boolean;
}

interface HomepageTile {
  id: string;
  title: string;
  description: string;
  image_url: string;
  link_url: string;
  display_order: number;
  is_active: boolean;
}

export const WebsiteHomepageManager: React.FC = () => {
  const { currentClub, darkMode } = useAuth();
  const { addNotification } = useNotifications();
  const [slides, setSlides] = useState<HomepageSlide[]>([]);
  const [tiles, setTiles] = useState<HomepageTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlide, setEditingSlide] = useState<HomepageSlide | null>(null);
  const [editingTile, setEditingTile] = useState<HomepageTile | null>(null);
  const [showSlideModal, setShowSlideModal] = useState(false);
  const [showTileModal, setShowTileModal] = useState(false);

  useEffect(() => {
    if (currentClub) {
      loadData();
    }
  }, [currentClub]);

  const loadData = async () => {
    if (!currentClub) return;

    try {
      setLoading(true);

      // Load slides
      const { data: slidesData, error: slidesError } = await supabase
        .from('homepage_slides')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .order('display_order');

      if (slidesError) throw slidesError;
      setSlides(slidesData || []);

      // Load tiles
      const { data: tilesData, error: tilesError } = await supabase
        .from('homepage_tiles')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .order('display_order');

      if (tilesError) throw tilesError;
      setTiles(tilesData || []);

    } catch (error) {
      console.error('Error loading data:', error);
      addNotification('error', 'Failed to load homepage data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSlide = async (slide: Partial<HomepageSlide>) => {
    if (!currentClub) return;

    try {
      if (editingSlide) {
        // Update existing slide
        const { error } = await supabase
          .from('homepage_slides')
          .update({
            ...slide,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingSlide.id);

        if (error) throw error;
        addNotification('success', 'Slide updated successfully');
      } else {
        // Create new slide
        const { error } = await supabase
          .from('homepage_slides')
          .insert({
            ...slide,
            club_id: currentClub.clubId,
            display_order: slides.length
          });

        if (error) throw error;
        addNotification('success', 'Slide created successfully');
      }

      setShowSlideModal(false);
      setEditingSlide(null);
      loadData();
    } catch (error) {
      console.error('Error saving slide:', error);
      addNotification('error', 'Failed to save slide');
    }
  };

  const handleSaveTile = async (tile: Partial<HomepageTile>) => {
    if (!currentClub) return;

    try {
      if (editingTile) {
        // Update existing tile
        const { error } = await supabase
          .from('homepage_tiles')
          .update({
            ...tile,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTile.id);

        if (error) throw error;
        addNotification('success', 'Tile updated successfully');
      } else {
        // Create new tile
        const { error } = await supabase
          .from('homepage_tiles')
          .insert({
            ...tile,
            club_id: currentClub.clubId,
            display_order: tiles.length
          });

        if (error) throw error;
        addNotification('success', 'Tile created successfully');
      }

      setShowTileModal(false);
      setEditingTile(null);
      loadData();
    } catch (error) {
      console.error('Error saving tile:', error);
      addNotification('error', 'Failed to save tile');
    }
  };

  const toggleSlideActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('homepage_slides')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error toggling slide:', error);
      addNotification('error', 'Failed to update slide');
    }
  };

  const toggleTileActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('homepage_tiles')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error toggling tile:', error);
      addNotification('error', 'Failed to update tile');
    }
  };

  const deleteSlide = async (id: string) => {
    if (!confirm('Are you sure you want to delete this slide?')) return;

    try {
      const { error } = await supabase
        .from('homepage_slides')
        .delete()
        .eq('id', id);

      if (error) throw error;
      addNotification('success', 'Slide deleted successfully');
      loadData();
    } catch (error) {
      console.error('Error deleting slide:', error);
      addNotification('error', 'Failed to delete slide');
    }
  };

  const deleteTile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tile?')) return;

    try {
      const { error } = await supabase
        .from('homepage_tiles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      addNotification('success', 'Tile deleted successfully');
      loadData();
    } catch (error) {
      console.error('Error deleting tile:', error);
      addNotification('error', 'Failed to delete tile');
    }
  };

  if (loading) {
    return <div className="p-6 text-center">Loading...</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 md:p-8 lg:p-16">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Homepage Management
          </h1>
          <p className="mt-2 text-slate-400">
            Customize your club's public homepage with carousel slides and quick link tiles
          </p>
        </div>

        <div className="space-y-8">
          {/* Homepage Slides Section */}
          <div className="rounded-xl border p-6 bg-slate-800/50 border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Homepage Carousel Slides
                </h2>
                <p className="text-sm mt-1 text-slate-400">
                  Manage the image carousel on your club homepage
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingSlide(null);
                  setShowSlideModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Slide
              </button>
            </div>

        <div className="space-y-3">
          {slides.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg border-slate-700 text-slate-400">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No slides yet. Add your first slide to get started.</p>
            </div>
          ) : (
            slides.map((slide) => (
              <div
                key={slide.id}
                onClick={() => {
                  setEditingSlide(slide);
                  setShowSlideModal(true);
                }}
                className={`flex items-center gap-4 p-4 rounded-lg border bg-slate-700/50 border-slate-600 cursor-pointer hover:bg-slate-700 hover:border-blue-500 transition-all ${!slide.is_active ? 'opacity-50' : ''}`}
              >
                <img
                  src={slide.image_url}
                  alt={slide.title}
                  className="w-24 h-16 object-cover rounded"
                />
                <div className="flex-1 pointer-events-none">
                  <h3 className="font-medium text-white">
                    {slide.title}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {slide.subtitle}
                  </p>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => toggleSlideActive(slide.id, slide.is_active)}
                    className="p-2 rounded transition-colors hover:bg-slate-600"
                    title={slide.is_active ? 'Hide slide' : 'Show slide'}
                  >
                    {slide.is_active ? (
                      <Eye className="w-4 h-4 text-green-500" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditingSlide(slide);
                      setShowSlideModal(true);
                    }}
                    className="p-2 rounded transition-colors hover:bg-slate-600"
                  >
                    <Edit2 className="w-4 h-4 text-blue-500" />
                  </button>
                  <button
                    onClick={() => deleteSlide(slide.id)}
                    className="p-2 rounded transition-colors hover:bg-slate-600"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Homepage Tiles Section */}
      <div className="rounded-xl border p-6 bg-slate-800/50 border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Quick Link Tiles
            </h2>
            <p className="text-sm mt-1 text-slate-400">
              Manage up to 6 clickable tiles that link to key pages
            </p>
          </div>
          <button
            onClick={() => {
              setEditingTile(null);
              setShowTileModal(true);
            }}
            disabled={tiles.length >= 6}
            className={`inline-flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors ${
              tiles.length >= 6
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
            title={tiles.length >= 6 ? 'Maximum of 6 tiles reached' : 'Add a new tile'}
          >
            <Plus className="w-4 h-4" />
            Add Tile
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.length === 0 ? (
            <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg border-slate-700 text-slate-400">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No tiles yet. Add your first tile to get started.</p>
            </div>
          ) : (
            tiles.map((tile) => (
              <div
                key={tile.id}
                onClick={() => {
                  setEditingTile(tile);
                  setShowTileModal(true);
                }}
                className={`relative group rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all ${!tile.is_active ? 'opacity-50' : ''}`}
              >
                <img
                  src={tile.image_url}
                  alt={tile.title}
                  className="w-full h-48 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-end p-4 text-white pointer-events-none">
                  <h3 className="font-bold uppercase">{tile.title}</h3>
                </div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => toggleTileActive(tile.id, tile.is_active)}
                    className="p-1.5 bg-white rounded shadow"
                    title={tile.is_active ? 'Hide tile' : 'Show tile'}
                  >
                    {tile.is_active ? (
                      <Eye className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-gray-600" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditingTile(tile);
                      setShowTileModal(true);
                    }}
                    className="p-1.5 bg-white rounded shadow"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  </button>
                  <button
                    onClick={() => deleteTile(tile.id)}
                    className="p-1.5 bg-white rounded shadow"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
        </div>

        {/* Modals */}
        <HomepageSlideModal
          isOpen={showSlideModal}
          onClose={() => {
            setShowSlideModal(false);
            setEditingSlide(null);
          }}
          onSave={handleSaveSlide}
          slide={editingSlide}
          darkMode={darkMode}
        />

        <HomepageTileModal
          isOpen={showTileModal}
          onClose={() => {
            setShowTileModal(false);
            setEditingTile(null);
          }}
          onSave={handleSaveTile}
          tile={editingTile}
          darkMode={darkMode}
        />
      </div>
    </div>
  );
};
