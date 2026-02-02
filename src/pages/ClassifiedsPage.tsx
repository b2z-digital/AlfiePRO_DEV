import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Plus, Heart, MapPin, Calendar, Eye, Tag, X, Edit2, Trash2, Grid, List, ArrowUpDown, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getClassifieds, getUserClassifieds, getUserFavorites, toggleClassifiedFavorite, deleteClassified } from '../utils/classifiedStorage';
import type { Classified } from '../types/classified';
import { CLASSIFIED_CATEGORIES } from '../types/classified';
import ClassifiedDetailModal from '../components/classifieds/ClassifiedDetailModal';
import ClassifiedFormModal from '../components/classifieds/ClassifiedFormModal';
import { useNotifications } from '../contexts/NotificationContext';

type ViewMode = 'all' | 'my-listings' | 'favorites';
type DisplayMode = 'grid' | 'list';
type SortOption = 'newest' | 'oldest' | 'price-low' | 'price-high' | 'title';

export default function ClassifiedsPage() {
  const { user, currentClub } = useAuth();
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

  const formatPrice = (price: number) => {
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

  const getCategoryLabel = (categoryValue: string) => {
    const category = CLASSIFIED_CATEGORIES.find(c => c.value === categoryValue);
    return category ? `${category.icon} ${category.label}` : categoryValue;
  };

  const handleTabChange = (newMode: ViewMode) => {
    setViewMode(newMode);
    setSearchTerm('');
    setSelectedCategory('');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <ShoppingBag className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Classifieds</h1>
            <p className="text-slate-400">Buy, sell, and trade sailing gear with your club community</p>
          </div>
        </div>

        {/* View Mode Tabs with Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button
            onClick={() => handleTabChange('all')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700/50 text-white hover:bg-slate-700'
            }`}
          >
            All Listings
          </button>
          <button
            onClick={() => handleTabChange('my-listings')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'my-listings'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700/50 text-white hover:bg-slate-700'
            }`}
          >
            My Listings
          </button>
          <button
            onClick={() => handleTabChange('favorites')}
            className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
              viewMode === 'favorites'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700/50 text-white hover:bg-slate-700'
            }`}
          >
            <Heart size={18} />
            Favorites
          </button>

          {/* Icon Toolbar */}
          <div className="flex items-center gap-3 ml-auto">
            {/* Search Button */}
            <button
              onClick={() => setShowSearchBar(!showSearchBar)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              title="Search"
            >
              <Search size={20} className="text-slate-300" />
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setDisplayMode('grid')}
                className={`p-2 rounded transition-colors ${
                  displayMode === 'grid'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Grid view"
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setDisplayMode('list')}
                className={`p-2 rounded transition-colors ${
                  displayMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>

            {/* Sort Button */}
            <div className="relative sort-menu-container">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                title="Sort"
              >
                <ArrowUpDown size={20} className="text-slate-300" />
              </button>
              {showSortMenu && (
                <div className="absolute top-full mt-2 right-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 min-w-[180px]">
                  {[
                    { value: 'newest' as SortOption, label: 'Newest First' },
                    { value: 'oldest' as SortOption, label: 'Oldest First' },
                    { value: 'price-low' as SortOption, label: 'Price: Low to High' },
                    { value: 'price-high' as SortOption, label: 'Price: High to Low' },
                    { value: 'title' as SortOption, label: 'Title (A-Z)' }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value);
                        setShowSortMenu(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        sortBy === option.value ? 'text-blue-400 bg-slate-700/50' : 'text-slate-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              title="Filters"
            >
              <Filter size={20} className="text-slate-300" />
            </button>

            {/* Create Listing Button */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 flex items-center gap-2 animate-pulse"
            >
              <Plus size={18} />
              Create Listing
            </button>
          </div>
        </div>

        {/* Expandable Search Bar */}
        {showSearchBar && (
          <div className="mb-6 relative animate-slideDown">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              id="classifieds-search"
              type="text"
              placeholder="Search classifieds..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 mb-6 border border-slate-700/50 filter-menu-container">
            {/* Visibility Filter */}
            <div className="mb-4 pb-4 border-b border-slate-700">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Visibility</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setVisibilityFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    visibilityFilter === 'all'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700/50 text-white hover:bg-slate-700'
                  }`}
                >
                  All Listings
                </button>
                <button
                  onClick={() => setVisibilityFilter('club')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    visibilityFilter === 'club'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700/50 text-white hover:bg-slate-700'
                  }`}
                >
                  Club Only
                </button>
                <button
                  onClick={() => setVisibilityFilter('public')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    visibilityFilter === 'public'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700/50 text-white hover:bg-slate-700'
                  }`}
                >
                  Public
                </button>
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">Category</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedCategory === ''
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700/50 text-white hover:bg-slate-700'
                  }`}
                >
                  All Categories
                </button>
                {CLASSIFIED_CATEGORIES.map(category => (
                  <button
                    key={category.value}
                    onClick={() => setSelectedCategory(category.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedCategory === category.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700/50 text-white hover:bg-slate-700'
                    }`}
                  >
                    <span className="mr-1">{category.icon}</span>
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="mb-4 text-slate-400">
          {filteredClassifieds.length} {filteredClassifieds.length === 1 ? 'listing' : 'listings'} found
        </div>

        {/* Classifieds Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-white text-xl">Loading classifieds...</div>
          </div>
        ) : filteredClassifieds.length === 0 ? (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-12 text-center border border-slate-700/50">
            <Tag size={48} className="mx-auto text-slate-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No listings found</h3>
            <p className="text-slate-400 mb-6">
              {viewMode === 'my-listings'
                ? 'You haven\'t created any listings yet.'
                : viewMode === 'favorites'
                ? 'You haven\'t favorited any listings yet.'
                : 'No listings match your search criteria.'}
            </p>
            {viewMode === 'my-listings' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
              >
                Create Your First Listing
              </button>
            )}
          </div>
        ) : (
          <div className={displayMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
            {filteredClassifieds.map(classified => displayMode === 'grid' ? (
              <div
                key={classified.id}
                onClick={() => setSelectedClassified(classified)}
                className="bg-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden hover:bg-slate-800/70 transition-all cursor-pointer group border border-slate-700/50"
              >
                {/* Image */}
                <div className="relative aspect-video overflow-hidden bg-slate-900">
                  {classified.images && classified.images.length > 0 ? (
                    <img
                      src={classified.images[0]}
                      alt={classified.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Tag size={48} className="text-slate-600" />
                    </div>
                  )}

                  {/* Category Badge */}
                  <div className="absolute top-3 left-3 px-3 py-1 bg-blue-500 text-white text-sm font-medium rounded-full">
                    {getCategoryLabel(classified.category)}
                  </div>

                  {/* Action Buttons */}
                  <div className="absolute top-3 right-3 flex gap-2">
                    {/* Edit/Delete buttons - only show for user's own listings */}
                    {classified.user_id === user?.id && (
                      <>
                        <button
                          onClick={(e) => handleEdit(classified, e)}
                          className="w-10 h-10 rounded-full bg-slate-900/50 backdrop-blur-sm hover:bg-blue-500/70 transition-colors flex items-center justify-center"
                        >
                          <Edit2 size={18} className="text-white" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(classified, e)}
                          className="w-10 h-10 rounded-full bg-slate-900/50 backdrop-blur-sm hover:bg-red-500/70 transition-colors flex items-center justify-center"
                        >
                          <Trash2 size={18} className="text-white" />
                        </button>
                      </>
                    )}

                    {/* Favorite Button */}
                    <button
                      onClick={(e) => handleToggleFavorite(classified.id, e)}
                      className="w-10 h-10 rounded-full bg-slate-900/50 backdrop-blur-sm hover:bg-slate-900/70 transition-colors flex items-center justify-center"
                    >
                      <Heart
                        size={20}
                        className={favorites.has(classified.id) ? 'fill-red-500 text-red-500' : 'text-white'}
                      />
                    </button>
                  </div>

                  {/* Featured Badge */}
                  {classified.featured && (
                    <div className="absolute bottom-3 left-3 px-3 py-1 bg-yellow-500 text-white text-sm font-medium rounded-full">
                      ⭐ Featured
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-xl font-bold text-white group-hover:text-blue-300 transition-colors flex-1">
                      {classified.title}
                    </h3>
                  </div>

                  <div className="text-2xl font-bold text-blue-400 mb-3">
                    {formatPrice(classified.price)}
                  </div>

                  <p className="text-slate-300 text-sm mb-4 line-clamp-2">
                    {classified.description}
                  </p>

                  {/* Meta Info */}
                  <div className="space-y-2 text-sm text-slate-400">
                    <div className="flex items-center gap-2">
                      <MapPin size={16} />
                      <span>{classified.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} />
                      <span>Listed {formatDate(classified.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Eye size={16} />
                      <span>{classified.views_count || 0} views</span>
                    </div>
                  </div>

                  {/* Condition Badge */}
                  <div className="mt-4 inline-block px-3 py-1 bg-slate-700/50 text-slate-300 text-xs font-medium rounded-full capitalize">
                    {classified.condition}
                  </div>

                  {/* Public Badge */}
                  {classified.is_public && (
                    <div className="mt-2 inline-block ml-2 px-3 py-1 bg-green-500/20 text-green-300 text-xs font-medium rounded-full">
                      Public Listing
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // List View
              <div
                key={classified.id}
                onClick={() => setSelectedClassified(classified)}
                className="bg-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden hover:bg-slate-800/70 transition-all cursor-pointer border border-slate-700/50 p-4"
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="relative w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-slate-900">
                    {classified.images && classified.images.length > 0 ? (
                      <img
                        src={classified.images[0]}
                        alt={classified.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Tag size={32} className="text-slate-600" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-white mb-1">{classified.title}</h3>
                        <p className="text-2xl font-bold text-green-400">{formatPrice(classified.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {classified.user_id === user?.id && (
                          <>
                            <button
                              onClick={(e) => handleEdit(classified, e)}
                              className="p-2 rounded-lg bg-slate-700 hover:bg-blue-500 transition-colors"
                            >
                              <Edit2 size={18} className="text-white" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteClick(classified, e)}
                              className="p-2 rounded-lg bg-slate-700 hover:bg-red-500 transition-colors"
                            >
                              <Trash2 size={18} className="text-white" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={(e) => handleToggleFavorite(classified.id, e)}
                          className="p-2 rounded-lg bg-slate-700 hover:bg-pink-500 transition-colors"
                        >
                          <Heart
                            size={18}
                            className={favorites.has(classified.id) ? 'fill-pink-500 text-pink-500' : 'text-white'}
                          />
                        </button>
                      </div>
                    </div>

                    <p className="text-slate-300 text-sm line-clamp-2 mb-3">{classified.description}</p>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-medium">
                        {getCategoryLabel(classified.category)}
                      </span>
                      <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                        {classified.condition}
                      </span>
                      {classified.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={14} />
                          {classified.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        Listed {formatDate(classified.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye size={14} />
                        {classified.views_count || 0} views
                      </span>
                      {classified.is_public && (
                        <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs">
                          Public Listing
                        </span>
                      )}
                    </div>
                  </div>
                </div>
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
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-700">
            <h3 className="text-xl font-semibold text-white mb-4">Delete Listing</h3>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete "{classifiedToDelete.title}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setClassifiedToDelete(null);
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
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
