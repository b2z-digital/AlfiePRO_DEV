import React, { useState, useEffect } from 'react';
import { Plus, SquarePen as Edit2, Trash2, Image as ImageIcon, Eye, EyeOff, ChevronLeft, ChevronRight, House as Home, GalleryHorizontal, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ASwitch } from '../alfie/Kit';
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
  const navigate = useNavigate();
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
    return <div className="a-dim p-6 text-center">Loading…</div>;
  }

  const atMax = tiles.length >= 6;
  const previewHref = `/club/${currentClub?.clubId}/public`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="a-mute flex items-center gap-2 text-[13.5px]">
          <button onClick={() => navigate('/website')} className="a-txt-b inline-flex items-center gap-1 font-medium">
            <ChevronLeft size={16} />Website
          </button>
          <span>/</span>
          <span className="a-ink">Homepage</span>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Home size={22} /></span>
          <div className="flex-1 min-w-0">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">Homepage</h1>
            <p className="a-mute mt-1 text-[14.5px]">Customise your club's public homepage with carousel slides and quick link tiles</p>
          </div>
          <a href={previewHref} target="_blank" rel="noopener noreferrer" className="a-btn"><Eye size={17} />Preview homepage</a>
        </div>

        {/* Carousel slides */}
        <div className="a-card overflow-hidden">
          <div style={{ padding: '20px 20px 12px' }}>
            <div className="flex items-center gap-3">
              <span className="a-tile a-tile-sm"><GalleryHorizontal size={18} /></span>
              <div className="flex-1 min-w-0">
                <h2 className="a-display a-ink m-0 text-[18px] font-semibold">Carousel slides</h2>
                <p className="a-dim mt-0.5 text-[12.5px]">The rotating hero images on your homepage</p>
              </div>
              <button
                onClick={() => { setEditingSlide(null); setShowSlideModal(true); }}
                className="a-btn a-btn-p" style={{ height: 40 }}
              >
                <Plus size={16} />Add slide
              </button>
            </div>
          </div>

          {slides.length === 0 ? (
            <div className="flex flex-col items-center text-center" style={{ padding: '28px 20px 36px' }}>
              <span className="a-tile mb-3" style={{ width: 52, height: 52 }}><ImageIcon size={22} /></span>
              <p className="a-ink font-semibold mb-1">No slides yet</p>
              <p className="a-dim text-[13.5px]">Add your first slide to get started</p>
            </div>
          ) : (
            slides.map((slide, i) => (
              <div
                key={slide.id}
                onClick={() => { setEditingSlide(slide); setShowSlideModal(true); }}
                className="a-hsl cursor-pointer"
                style={!slide.is_active ? { opacity: 0.55 } : undefined}
              >
                <div className="relative">
                  <img src={slide.image_url} alt="" className="block object-cover" style={{ width: 120, height: 72, borderRadius: 12 }} />
                  <span className="a-hsl-num">{i + 1}</span>
                </div>
                <div className="min-w-0">
                  <div className="a-ink text-[15px] font-semibold truncate">{slide.title}</div>
                  {slide.subtitle && <div className="a-mute text-[13px] mt-1 line-clamp-2 leading-[1.45]">{slide.subtitle}</div>}
                </div>
                <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                  <span className="a-dim text-[12.5px] max-sm:hidden">{slide.is_active ? 'Visible' : 'Hidden'}</span>
                  <ASwitch checked={slide.is_active} onChange={() => toggleSlideActive(slide.id, slide.is_active)} label={slide.is_active ? 'Hide slide' : 'Show slide'} />
                  <button onClick={() => { setEditingSlide(slide); setShowSlideModal(true); }} className="a-ib" aria-label="Edit slide" title="Edit slide"><Edit2 size={16} /></button>
                  <button onClick={() => deleteSlide(slide.id)} className="a-ib a-ib-d" aria-label="Delete slide" title="Delete slide"><Trash2 size={16} /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick link tiles */}
        <div className="a-card flex flex-col gap-4" style={{ padding: 20 }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="a-tile a-tile-sm"><LayoutGrid size={18} /></span>
            <div className="flex-1 min-w-0">
              <h2 className="a-display a-ink m-0 text-[18px] font-semibold">Quick link tiles</h2>
              <p className="a-dim mt-0.5 text-[12.5px]">Clickable tiles that link to key pages</p>
            </div>
            <span className="a-mute text-[13px] mr-2.5"><b className="a-ink">{tiles.length}</b>/6 used</span>
            <button
              onClick={() => { setEditingTile(null); setShowTileModal(true); }}
              disabled={atMax}
              className="a-btn disabled:opacity-45 disabled:cursor-not-allowed" style={{ height: 40 }}
              title={atMax ? 'Maximum of 6 tiles' : 'Add a new tile'}
            >
              <Plus size={16} />Add tile
            </button>
          </div>

          {tiles.length === 0 ? (
            <div className="a-grp flex flex-col items-center text-center" style={{ padding: 32 }}>
              <span className="a-tile mb-3" style={{ width: 52, height: 52 }}><ImageIcon size={22} /></span>
              <p className="a-ink font-semibold mb-1">No tiles yet</p>
              <p className="a-dim text-[13.5px]">Add your first tile to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tiles.map((tile) => (
                <div
                  key={tile.id}
                  onClick={() => { setEditingTile(tile); setShowTileModal(true); }}
                  className="a-qt"
                  style={!tile.is_active ? { opacity: 0.55 } : undefined}
                  role="button"
                  tabIndex={0}
                >
                  <img src={tile.image_url} alt="" />
                  <div className="a-qt-ov" />
                  <div className="a-qt-ctl" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleTileActive(tile.id, tile.is_active)} className="a-gb" aria-label={tile.is_active ? 'Hide tile' : 'Show tile'} title={tile.is_active ? 'Hide tile' : 'Show tile'}>
                      {tile.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button onClick={() => { setEditingTile(tile); setShowTileModal(true); }} className="a-gb" aria-label="Edit tile" title="Edit tile"><Edit2 size={16} /></button>
                    <button onClick={() => deleteTile(tile.id)} className="a-gb a-gb-d" aria-label="Delete tile" title="Delete tile"><Trash2 size={16} /></button>
                  </div>
                  <div className="absolute flex items-center justify-between" style={{ left: 16, right: 16, bottom: 13 }}>
                    <span className="a-display a-qt-t text-[17px] font-semibold truncate">{tile.title}</span>
                    <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.7)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
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
