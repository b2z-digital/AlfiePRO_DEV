import React, { useState, useEffect, useCallback } from 'react';
import { Search, ListFilter as Filter, Plus, Heart, MapPin, Eye, Tag, X, SquarePen as Edit2, Trash2, Grid2x2 as Grid, List, ShoppingBag, Globe, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getClassifieds, getUserClassifieds, getUserFavorites, toggleClassifiedFavorite, deleteClassified } from '../utils/classifiedStorage';
import type { Classified } from '../types/classified';
import { CLASSIFIED_CATEGORIES } from '../types/classified';
import ClassifiedDetailModal from '../components/classifieds/ClassifiedDetailModal';
import { ClassifiedPhoto, photoMetaFor } from '../components/classifieds/ClassifiedPhoto';
import ClassifiedFormModal from '../components/classifieds/ClassifiedFormModal';
import { useNotifications } from '../contexts/NotificationContext';

type ViewMode = 'all' | 'my-listings' | 'favorites';
type DisplayMode = 'grid' | 'list';
type SortOption = 'newest' | 'oldest' | 'price-low' | 'price-high' | 'title';

export default function ClassifiedsPage() {
  const { user, currentClub, isSuperAdmin, isStateOrgAdmin } = useAuth();
  const { addNotification } = useNotifications();
  const [classifieds, setClassifieds] = useState<Classified[]>([]);
  const [filteredClassifieds, setFilteredClassifieds] = useState<Classified[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'club' | 'public'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [selectedClassified, setSelectedClassified] = useState<Classified | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingClassified, setEditingClassified] = useState<Classified | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [classifiedToDelete, setClassifiedToDelete] = useState<Classified | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const loadClassifieds = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      let data: Classified[] = [];

      if (viewMode === 'all') {
        data = await getClassifieds(currentClub?.clubId, true);
      } else if (viewMode === 'my-listings') {
        data = await getUserClassifieds(user.id);
      } else if (viewMode === 'favorites') {
        const favData = await getUserFavorites(user.id);
        data = favData
          .map((fav: any) => fav.classified)
          .filter((c: Classified) => c && c.status === 'active');
      }

      setClassifieds(data);

      // Always load favorites to update heart icon state
      const favData = await getUserFavorites(user.id);
      const favSet = new Set(favData.map((fav: any) => fav.classified_id));
      setFavorites(favSet);
    } catch (error) {
      console.error('Error loading classifieds:', error);
    } finally {
      setLoading(false);
    }
  }, [user, viewMode, currentClub]);

  useEffect(() => {
    loadClassifieds();
  }, [loadClassifieds]);

  useEffect(() => {
    filterClassifieds();
  }, [classifieds, searchTerm, selectedCategory, sortBy, visibilityFilter]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.sort-menu-container') && !target.closest('.filter-menu-container')) {
        setShowSortMenu(false);
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filterClassifieds = () => {
    let filtered = [...classifieds];

    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter(c => c.category === selectedCategory);
    }

    if (visibilityFilter !== 'all') {
      if (visibilityFilter === 'public') {
        filtered = filtered.filter(c => c.is_public);
      } else if (visibilityFilter === 'club') {
        filtered = filtered.filter(c => !c.is_public);
      }
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'price-low':
          return a.price - b.price;
        case 'price-high':
          return b.price - a.price;
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    setFilteredClassifieds(filtered);
  };

  const handleToggleFavorite = async (classifiedId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    try {
      const isFavorited = await toggleClassifiedFavorite(classifiedId, user.id);

      if (isFavorited) {
        setFavorites(prev => new Set([...prev, classifiedId]));
      } else {
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(classifiedId);
          return newSet;
        });
      }

      if (viewMode === 'favorites') {
        loadClassifieds();
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleEdit = (classified: Classified, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingClassified(classified);
    setShowCreateModal(true);
  };

  const handleDeleteClick = (classified: Classified, e: React.MouseEvent) => {
    e.stopPropagation();
    setClassifiedToDelete(classified);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!classifiedToDelete) return;

    try {
      await deleteClassified(classifiedToDelete.id);

      // Close modal and clear state
      setShowDeleteConfirm(false);
      setClassifiedToDelete(null);

      // Show success notification
      addNotification('success', 'Listing deleted successfully');

      // Reload the listings
      await loadClassifieds();
    } catch (error) {
      console.error('Error deleting classified:', error);
      addNotification('error', 'Failed to delete listing');
      setShowDeleteConfirm(false);
      setClassifiedToDelete(null);
    }
  };

  const formatPrice = (price: number, classified?: { is_external?: boolean; title?: string }) => {
    if (price === 0 && classified?.is_external) {
      const titleMatch = classified.title?.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
      if (titleMatch) {
        const extracted = parseFloat(titleMatch[1].replace(/,/g, ''));
        if (extracted > 0) {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          }).format(extracted);
        }
      }
      return 'Contact Seller';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const canManageListing = (classified: Classified) => {
    return classified.user_id === user?.id || classified.created_by_user_id === user?.id || isSuperAdmin || isStateOrgAdmin;
  };

  const getCategoryLabel = (categoryValue: string) => {
    const category = CLASSIFIED_CATEGORIES.find(c => c.value === categoryValue);
    return category ? `${category.icon} ${category.label}` : categoryValue;
  };

  const handleTabChange = (newMode: ViewMode) => {
    setViewMode(newMode);
    setSearchTerm('');
    setSelectedCategory('');
  };

  const shortDate = (d: string) => { const x = new Date(d); return `${x.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][x.getMonth()]}`; };
  const catOnly = (v: string) => CLASSIFIED_CATEGORIES.find(c => c.value === v)?.label || v;
  const cover = (classified: Classified, iconSize = 52) => {
    const src = classified.images && classified.images.length > 0 ? classified.images[0] : null;
    return (
      <>
        {src ? (
          <ClassifiedPhoto
            src={src}
            meta={photoMetaFor(classified.image_meta, src)}
            alt={classified.title}
            className="absolute inset-0"
            onError={(e) => {
              const box = e.currentTarget.parentElement as HTMLElement | null;
              if (box) box.style.display = 'none';
              const placeholder = box?.parentElement?.querySelector('.no-img-placeholder') as HTMLElement | null;
              if (placeholder) placeholder.style.display = 'flex';
            }}
          />
        ) : null}
        <div className="no-img-placeholder a-bc-ph absolute inset-0 items-center justify-center" style={{ display: src ? 'none' : 'flex' }}>
          <img src="/alfie_app_logo.svg" alt="" style={{ width: iconSize, height: iconSize, opacity: 0.4 }} />
        </div>
      </>
    );
  };
  const actions = (classified: Classified, size = 34) => (
    <>
      {canManageListing(classified) && (
        <>
          <button onClick={(e) => handleEdit(classified, e)} className="a-gb" style={{ width: size, height: size }} aria-label="Edit listing" title="Edit listing"><Edit2 size={15} /></button>
          <button onClick={(e) => handleDeleteClick(classified, e)} className="a-gb a-gb-d" style={{ width: size, height: size }} aria-label="Delete listing" title="Delete listing"><Trash2 size={15} /></button>
        </>
      )}
      <button onClick={(e) => handleToggleFavorite(classified.id, e)} className="a-gb" style={{ width: size, height: size, color: favorites.has(classified.id) ? '#FF3E9A' : undefined }} aria-label={favorites.has(classified.id) ? 'Remove from saved' : 'Save'} title={favorites.has(classified.id) ? 'Saved' : 'Save'}>
        <Heart size={16} className={favorites.has(classified.id) ? 'fill-current' : ''} />
      </button>
    </>
  );
  const chips = (classified: Classified) => (
    <>
      {classified.condition && <span className="a-lb-fmt capitalize" style={{ height: 22, fontSize: 11.5 }}>{classified.condition}</span>}
      {classified.is_public && <span className="a-lb-fmt" style={{ height: 22, fontSize: 11.5 }}><Globe size={11} />Public</span>}
      {classified.is_external && <span className="a-lb-fmt" style={{ height: 22, fontSize: 11.5 }}><ExternalLink size={11} />External</span>}
      {classified.featured && <span className="a-lb-fmt a-txt-a" style={{ height: 22, fontSize: 11.5 }}>★ Featured</span>}
    </>
  );
  const meta = (classified: Classified) => (
    <div className="a-dim flex items-center gap-3 flex-wrap text-[12.5px]">
      {classified.location && <span className="inline-flex items-center gap-1"><MapPin size={13} />{classified.location}</span>}
      <span>{shortDate(classified.created_at)}</span>
      <span className="inline-flex items-center gap-1"><Eye size={13} />{classified.views_count || 0}</span>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><ShoppingBag size={24} /></span>
          <div className="flex-1 min-w-0">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">Classifieds</h1>
            <p className="a-mute mt-1 text-[14.5px]">Buy, sell and trade sailing gear with the community</p>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}>
            <Plus size={17} />Sell something
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="a-seg" role="tablist">
            <button onClick={() => handleTabChange('all')} className={`a-seg-i ${viewMode === 'all' ? 'a-seg-on' : ''}`} role="tab" aria-selected={viewMode === 'all'}>
              All listings{viewMode === 'all' && <span className="a-cnt">{filteredClassifieds.length}</span>}
            </button>
            <button onClick={() => handleTabChange('my-listings')} className={`a-seg-i ${viewMode === 'my-listings' ? 'a-seg-on' : ''}`} role="tab" aria-selected={viewMode === 'my-listings'}>My listings</button>
            <button onClick={() => handleTabChange('favorites')} className={`a-seg-i ${viewMode === 'favorites' ? 'a-seg-on' : ''}`} role="tab" aria-selected={viewMode === 'favorites'}><Heart size={15} />Saved</button>
          </div>
          <label className="a-field flex-1 min-w-[200px]">
            <Search size={16} />
            <input
              id="classifieds-search"
              type="text"
              placeholder="Search IOM, sails, winches…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && <button onClick={() => setSearchTerm('')} className="a-dim flex" aria-label="Clear search"><X size={14} /></button>}
          </label>
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="a-inp a-inp-sel" style={{ height: 42, width: 'auto', minWidth: 160 }} aria-label="Category">
            <option value="">All categories</option>
            {CLASSIFIED_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <div className="a-seg" role="radiogroup" aria-label="Layout">
            <button onClick={() => setDisplayMode('grid')} className={`a-seg-i ${displayMode === 'grid' ? 'a-seg-on' : ''}`} style={{ padding: '0 10px' }} aria-label="Grid" title="Grid view"><Grid size={17} /></button>
            <button onClick={() => setDisplayMode('list')} className={`a-seg-i ${displayMode === 'list' ? 'a-seg-on' : ''}`} style={{ padding: '0 10px' }} aria-label="List" title="List view"><List size={17} /></button>
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="a-inp a-inp-sel" style={{ height: 42, width: 'auto', minWidth: 140 }} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
            <option value="title">Title A–Z</option>
          </select>
          <button onClick={() => setShowFilters(!showFilters)} className={`a-ib ${showFilters || visibilityFilter !== 'all' ? 'a-ib-on' : ''}`} style={{ width: 42, height: 42 }} aria-label="Visibility filter" title="Visibility">
            <Filter size={17} />
          </button>
        </div>

        {showFilters && (
          <div className="flex items-center gap-2.5 filter-menu-container">
            <span className="a-cap">Visibility</span>
            <div className="a-seg">
              {(['all', 'club', 'public'] as const).map(v => (
                <button key={v} onClick={() => setVisibilityFilter(v)} className={`a-seg-i ${visibilityFilter === v ? 'a-seg-on' : ''}`}>
                  {v === 'all' ? 'All' : v === 'club' ? 'Club only' : 'Public'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="a-dim text-[13px] -mt-2">{filteredClassifieds.length} {filteredClassifieds.length === 1 ? 'listing' : 'listings'}</div>

        {loading ? (
          <div className="a-card text-center" style={{ padding: 48 }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
            <p className="a-dim text-[13.5px]">Loading classifieds…</p>
          </div>
        ) : filteredClassifieds.length === 0 ? (
          <div className="a-card a-empty text-center" style={{ padding: 48 }}>
            <span className="a-tile mx-auto mb-3" style={{ width: 52, height: 52 }}><Tag size={22} /></span>
            <h3 className="a-ink text-[16px] font-semibold mb-1">No listings found</h3>
            <p className="a-dim text-[13.5px] mb-5">
              {viewMode === 'my-listings' ? 'You haven’t listed anything yet.' : viewMode === 'favorites' ? 'You haven’t saved any listings yet.' : 'No listings match your search.'}
            </p>
            {viewMode === 'my-listings' && (
              <button onClick={() => setShowCreateModal(true)} className="a-btn a-btn-p mx-auto"><Plus size={16} />Create your first listing</button>
            )}
          </div>
        ) : displayMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredClassifieds.map(classified => (
              <div key={classified.id} onClick={() => setSelectedClassified(classified)} className="a-bc group" role="button" tabIndex={0}>
                <div className="a-bc-media">
                  {cover(classified)}
                  <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(6,11,22,0.25), rgba(6,11,22,0) 35%, rgba(6,11,22,0) 60%, rgba(6,11,22,0.75))' }} />
                  <span className="a-glass absolute" style={{ left: 12, top: 12 }}><Tag size={12} />{catOnly(classified.category)}</span>
                  <div className="absolute flex gap-1.5" style={{ right: 12, top: 12 }}>{actions(classified)}</div>
                  <span className="a-display a-num absolute font-semibold" style={{ left: 14, bottom: 12, fontSize: 26, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>{formatPrice(classified.price, classified)}</span>
                </div>
                <div className="flex flex-col gap-2" style={{ padding: '14px 16px 16px' }}>
                  <div className="a-ink text-[16px] font-semibold leading-[1.3] line-clamp-2">{classified.title}</div>
                  {classified.description && <div className="a-mute text-[13px] leading-[1.45] line-clamp-2">{classified.description}</div>}
                  <div className="mt-1">{meta(classified)}</div>
                  <div className="flex gap-1.5 flex-wrap mt-1">{chips(classified)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="a-card overflow-hidden">
            {filteredClassifieds.map(classified => (
              <div key={classified.id} onClick={() => setSelectedClassified(classified)} className="a-rr" style={{ padding: '12px 16px' }} role="button" tabIndex={0}>
                <div className="relative overflow-hidden flex-shrink-0" style={{ width: 112, height: 80, borderRadius: 12 }}>{cover(classified, 32)}</div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-3">
                    <span className="a-ink text-[15px] font-semibold truncate flex-1">{classified.title}</span>
                    <span className="a-display a-num a-ink text-[18px] font-semibold whitespace-nowrap">{formatPrice(classified.price, classified)}</span>
                  </div>
                  {meta(classified)}
                  <div className="flex gap-1.5 flex-wrap"><span className="a-lb-fmt" style={{ height: 22, fontSize: 11.5 }}><Tag size={11} />{catOnly(classified.category)}</span>{chips(classified)}</div>
                </div>
                <div className="flex gap-1.5 a-list-actions">{actions(classified, 32)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedClassified && (
        <ClassifiedDetailModal
          classified={selectedClassified}
          onClose={() => setSelectedClassified(null)}
          onUpdate={loadClassifieds}
        />
      )}

      {showCreateModal && (
        <ClassifiedFormModal
          classified={editingClassified}
          onClose={() => {
            setShowCreateModal(false);
            setEditingClassified(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setEditingClassified(null);
            loadClassifieds();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && classifiedToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="a-sheet max-w-md w-full" style={{ padding: 24 }}>
            <h3 className="a-display a-ink text-[20px] font-semibold mb-2">Delete listing</h3>
            <p className="a-mute text-[14px] mb-6">
              Are you sure you want to delete "{classifiedToDelete.title}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setClassifiedToDelete(null);
                }}
                className="a-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="a-btn a-btn-d"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
