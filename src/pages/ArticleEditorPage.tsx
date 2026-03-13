import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, X, Tag, Plus, Calendar, AlertTriangle, Check, Upload, Eye, FileText, Image as ImageIcon, Settings, Sparkles, Type, AlignLeft, BookOpen, Users, Globe, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { WysiwygEditor } from '../components/ui/WysiwygEditor';
import { getArticleById, createArticle, updateArticle, Article } from '../utils/articleStorage';
import { formatDate } from '../utils/date';
import { useNotifications } from '../contexts/NotificationContext';
import { supabase } from '../utils/supabase';
import { v4 as uuidv4 } from 'uuid';
import { ConfirmationModal } from '../components/ConfirmationModal';

const DEFAULT_COVER_IMAGE = '/RC-Yachts-image-custom_crop.jpg';

const ArticleEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, currentClub, currentOrganization } = useAuth();

  // Get event context from URL params
  const searchParams = new URLSearchParams(window.location.search);
  const eventWebsiteId = searchParams.get('eventWebsiteId');
  const eventId = searchParams.get('eventId');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(true);
  const { addNotification } = useNotifications();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [eventName, setEventName] = useState<string | null>(null);
  const [selectedYachtClasses, setSelectedYachtClasses] = useState<string[]>(['generic']);
  const [availableYachtClasses, setAvailableYachtClasses] = useState<Array<{ id: string; name: string }>>([]);

  // Community publishing
  const [publishToCommunity, setPublishToCommunity] = useState(false);
  const [communityGroupIds, setCommunityGroupIds] = useState<string[]>([]);
  const [availableCommunityGroups, setAvailableCommunityGroups] = useState<Array<{ id: string; name: string; club_name?: string }>>([]);
  const [uploadingInlineImage, setUploadingInlineImage] = useState(false);

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch yacht classes from national level
        const { data: yachtClasses } = await supabase
          .from('boat_classes')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (yachtClasses) {
          setAvailableYachtClasses(yachtClasses);
        }

        // Fetch community groups for publishing
        // For club users: fetch own club group
        // For association users: fetch all clubs' groups under that association
        const orgId = currentOrganization?.id;
        const clubId = currentClub?.clubId;

        if (clubId) {
          const { data: groups } = await supabase
            .from('social_groups')
            .select('id, name')
            .eq('club_id', clubId)
            .order('name');
          if (groups) {
            setAvailableCommunityGroups(groups);
            if (groups.length > 0) setCommunityGroupIds([groups[0].id]);
          }
        } else if (orgId && currentOrganization?.type) {
          const assocColumn = currentOrganization.type === 'state' ? 'state_association_id' : 'national_association_id';

          // Get all clubs under this association
          const { data: clubs } = await supabase
            .from('clubs')
            .select('id, name')
            .eq(assocColumn, orgId)
            .order('name');

          if (clubs && clubs.length > 0) {
            const clubIds = clubs.map(c => c.id);
            const { data: groups } = await supabase
              .from('social_groups')
              .select('id, name, club_id')
              .in('club_id', clubIds)
              .order('name');

            if (groups) {
              const clubMap = Object.fromEntries(clubs.map(c => [c.id, c.name]));
              setAvailableCommunityGroups(
                groups.map(g => ({ id: g.id, name: g.name, club_name: clubMap[g.club_id] }))
              );
            }
          }
        }

        // Fetch event name if event context exists
        if (eventId) {
          const { data: eventData } = await supabase
            .from('quick_races')
            .select('event_name')
            .eq('id', eventId)
            .maybeSingle();
          if (eventData) {
            setEventName(eventData.event_name);
          }
        }

        if (!id || id === 'new') {
          setLoading(false);
          return;
        }

        const fetchedArticle = await getArticleById(id);
        if (fetchedArticle) {
          setTitle(fetchedArticle.title);
          setContent(fetchedArticle.content);
          setExcerpt(fetchedArticle.excerpt || '');
          setCoverImage(fetchedArticle.cover_image || '');
          setTags(fetchedArticle.tags || []);
          setIsPublished(fetchedArticle.status === 'published');

          // Fetch yacht classes for this article
          const { data: articleClasses } = await supabase
            .from('article_yacht_classes')
            .select('boat_class_id, is_generic')
            .eq('article_id', id);

          if (articleClasses && articleClasses.length > 0) {
            const classIds = articleClasses.map(ac =>
              ac.is_generic ? 'generic' : ac.boat_class_id
            ).filter(Boolean) as string[];
            setSelectedYachtClasses(classIds.length > 0 ? classIds : ['generic']);
          }
        } else {
          setError('Article not found');
        }
      } catch (err) {
        console.error('Error fetching article:', err);
        setError(err instanceof Error ? err.message : 'Failed to load article');
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [id, eventId, currentClub?.clubId, currentOrganization?.id, currentOrganization?.type]);

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleToggleYachtClass = (classId: string) => {
    setSelectedYachtClasses(prev => {
      // If selecting generic, clear all others
      if (classId === 'generic') {
        return prev.includes('generic') ? [] : ['generic'];
      }

      // If selecting a class, remove generic
      let newClasses = prev.filter(id => id !== 'generic');

      if (prev.includes(classId)) {
        newClasses = newClasses.filter(id => id !== classId);
      } else {
        newClasses.push(classId);
      }

      // If nothing selected, default to generic
      return newClasses.length === 0 ? ['generic'] : newClasses;
    });
  };

  const handleUploadImage = async (file: File) => {
    const organizationId = currentOrganization?.id || currentClub?.clubId;
    if (!file || !organizationId) return;

    try {
      setUploadingImage(true);
      setError(null);

      const { compressImage } = await import('../utils/imageCompression');
      const compressed = await compressImage(file, 'cover');

      const fileExt = compressed.name.split('.').pop();
      const orgId = currentOrganization?.id || currentClub?.clubId;
      const fileName = `${orgId}/${uuidv4()}-${Date.now()}.${fileExt}`;

      const { data, error: uploadError } = await supabase.storage
        .from('article-images')
        .upload(fileName, compressed, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('article-images')
        .getPublicUrl(data.path);

      setCoverImage(publicUrl);
      setSuccess('Image uploaded successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error uploading image:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadImage(file);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleUploadImage(file);
      } else {
        setError('Please upload an image file');
      }
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleInlineImageUpload = async (file: File): Promise<string> => {
    const organizationId = currentOrganization?.id || currentClub?.clubId;
    if (!organizationId) throw new Error('No organization selected');

    setUploadingInlineImage(true);
    try {
      const { compressImage } = await import('../utils/imageCompression');
      const compressed = await compressImage(file, 'cover');
      const fileExt = compressed.name.split('.').pop();
      const fileName = `${organizationId}/${uuidv4()}-inline-${Date.now()}.${fileExt}`;

      const { data, error: uploadError } = await supabase.storage
        .from('article-images')
        .upload(fileName, compressed, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('article-images')
        .getPublicUrl(data.path);

      return publicUrl;
    } finally {
      setUploadingInlineImage(false);
    }
  };

  const handleToggleCommunityGroup = (groupId: string) => {
    setCommunityGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const handleSave = async (publish: boolean = false) => {
    try {
      const isAssociation = !!currentOrganization && !currentClub;
      if (!user?.id || (!currentClub?.clubId && !currentOrganization?.id)) {
        setError('You must be logged in and have a selected organization to save an article');
        return;
      }

      setSaving(true);
      setError(null);
      setSuccess(null);

      if (!title.trim()) {
        setError('Title is required');
        setSaving(false);
        return;
      }

      if (!content.trim()) {
        setError('Content is required');
        setSaving(false);
        return;
      }

      const generatedExcerpt = excerpt.trim() || content.replace(/<[^>]*>/g, '').substring(0, 150) + '...';

      const articleData: Omit<Article, 'id' | 'created_at' | 'updated_at'> = {
        title: title.trim(),
        content,
        excerpt: generatedExcerpt,
        author_id: user.id,
        club_id: currentClub?.clubId,
        state_association_id: currentOrganization?.type === 'state' ? currentOrganization.id : undefined,
        national_association_id: currentOrganization?.type === 'national' ? currentOrganization.id : undefined,
        event_website_id: eventWebsiteId || undefined,
        cover_image: coverImage || DEFAULT_COVER_IMAGE,
        status: publish ? 'published' : 'draft'
      };

      let articleId: string;
      if (id && id !== 'new') {
        await updateArticle(id, articleData, tags);
        articleId = id;
        setSuccess('Article updated successfully');
      } else {
        const newArticle = await createArticle(articleData, tags);
        articleId = newArticle.id;
        setSuccess('Article created successfully');
      }

      // Save yacht class associations
      if (articleId) {
        // Delete existing associations
        await supabase
          .from('article_yacht_classes')
          .delete()
          .eq('article_id', articleId);

        // Insert new associations
        const associations = selectedYachtClasses.map(classId => ({
          article_id: articleId,
          boat_class_id: classId === 'generic' ? null : classId,
          is_generic: classId === 'generic'
        }));

        if (associations.length > 0) {
          const { error: classError } = await supabase
            .from('article_yacht_classes')
            .insert(associations);

          if (classError) {
            console.error('Error saving yacht class associations:', classError);
          }
        }
      }

      // Publish to community groups if requested
      if (publish && publishToCommunity && communityGroupIds.length > 0 && user?.id) {
        const plainText = content.replace(/<[^>]*>/g, '').substring(0, 300);
        const postContent = `📰 **${title.trim()}**\n\n${plainText}${plainText.length >= 300 ? '...' : ''}`;

        const posts = communityGroupIds.map(groupId => ({
          author_id: user.id,
          club_id: currentClub?.clubId || null,
          group_id: groupId,
          content: postContent,
          content_type: 'link',
          privacy: 'group',
          link_url: `/news`,
          link_title: title.trim(),
          link_description: excerpt.trim() || plainText.substring(0, 150),
          link_image_url: coverImage || DEFAULT_COVER_IMAGE,
          is_pinned: false,
          is_moderated: false,
        }));

        const { error: postError } = await supabase
          .from('social_posts')
          .insert(posts);

        if (postError) {
          console.error('Error posting to community:', postError);
        }
      }

      setTimeout(() => {
        if (eventWebsiteId && eventId) {
          navigate(`/event-websites/${eventId}`);
        } else {
          navigate('/news');
        }
      }, 1500);
    } catch (err) {
      console.error('Error saving article:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while saving the article');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setShowCancelConfirm(true);
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    if (eventWebsiteId && eventId) {
      navigate(`/event-websites/${eventId}`);
    } else {
      navigate('/news');
    }
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-16">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-12 bg-slate-700/50 rounded-lg w-1/2"></div>
              <div className="grid grid-cols-3 gap-8">
                <div className="col-span-2 space-y-4">
                  <div className="h-64 bg-slate-700/50 rounded-lg"></div>
                  <div className="h-96 bg-slate-700/50 rounded-lg"></div>
                </div>
                <div className="space-y-4">
                  <div className="h-32 bg-slate-700/50 rounded-lg"></div>
                  <div className="h-48 bg-slate-700/50 rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length;
  const readingTime = Math.ceil(wordCount / 200);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => eventWebsiteId && eventId ? navigate(`/event-websites/${eventId}`) : navigate('/news')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600"
                >
                  <ArrowLeft size={16} />
                  Back to {eventName ? 'Event Website' : 'News'}
                </button>
                {eventName && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <Calendar size={16} className="text-cyan-400" />
                    <span className="text-cyan-400 text-sm font-medium">{eventName}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600"
                  disabled={saving}
                >
                  <X size={16} />
                  Cancel
                </button>

                <button
                  onClick={() => handleSave(false)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all bg-slate-700 text-white hover:bg-slate-600 border border-slate-600 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={saving}
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>

                <button
                  onClick={() => handleSave(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg hover:shadow-blue-500/20 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  disabled={saving}
                >
                  <Sparkles size={16} />
                  {saving ? 'Publishing...' : isPublished ? 'Update' : 'Publish'}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30 animate-in slide-in-from-top duration-300">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300 ml-3">{error}</p>
                </div>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-900/30 animate-in slide-in-from-top duration-300">
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-300 ml-3">{success}</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 transition-all hover:border-slate-600/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20">
                    <Type size={20} className="text-blue-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">Article Title</h2>
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-800/60 text-white text-2xl font-bold rounded-lg border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all placeholder-slate-500"
                  placeholder="Enter your article title..."
                />
                <div className="mt-3 flex items-center gap-4 text-sm text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <FileText size={14} />
                    <span>{title.length} characters</span>
                  </div>
                  {title.length > 0 && (
                    <div className={`flex items-center gap-1.5 ${title.length > 60 ? 'text-amber-400' : 'text-green-400'}`}>
                      <Check size={14} />
                      <span>{title.length > 60 ? 'Title is quite long' : 'Good length'}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 transition-all hover:border-slate-600/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20">
                    <BookOpen size={20} className="text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-white">Article Content</h2>
                    <p className="text-sm text-slate-400 mt-0.5">Write your article using the rich text editor</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    {uploadingInlineImage && (
                      <div className="flex items-center gap-1.5 text-blue-400">
                        <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-400" />
                        <span>Uploading image...</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <FileText size={14} />
                      <span>{wordCount} words</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Eye size={14} />
                      <span>{readingTime} min read</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg overflow-hidden border border-slate-700/50">
                  <WysiwygEditor
                    value={content}
                    onChange={setContent}
                    darkMode={true}
                    height={600}
                    placeholder="Start writing your article content here..."
                    onImageUpload={handleInlineImageUpload}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 transition-all hover:border-slate-600/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20">
                    <Settings size={20} className="text-purple-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Settings</h2>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                        <Calendar size={16} />
                        Publication Status
                      </label>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        isPublished
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
                      }`}>
                        {isPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 pl-6">
                      {isPublished
                        ? 'Article is live and visible to members'
                        : 'Save as draft or publish when ready'}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-700/50">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                      <Tag size={16} />
                      Tags
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
                      {tags.map(tag => (
                        <div
                          key={tag}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-sm border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                        >
                          <span className="font-medium">{tag}</span>
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="p-0.5 rounded-full hover:bg-blue-500/30 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {tags.length === 0 && (
                        <div className="text-sm text-slate-500 italic">No tags added</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                        className="flex-1 px-3 py-2 bg-slate-800/60 text-white rounded-lg border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-sm placeholder-slate-500"
                        placeholder="Add a tag..."
                      />
                      <button
                        onClick={handleAddTag}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-slate-700 text-white hover:bg-slate-600 border border-slate-600"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Yacht Classes Section */}
                  <div className="pt-4 border-t border-slate-700/50">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                      <Sparkles size={16} />
                      Yacht Classes
                    </label>
                    <p className="text-xs text-slate-400 mb-3">
                      Select which yacht classes this article relates to, or keep as Generic for all classes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {/* Generic Option */}
                      <button
                        type="button"
                        onClick={() => handleToggleYachtClass('generic')}
                        className={`
                          px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
                          ${selectedYachtClasses.includes('generic')
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 ring-2 ring-emerald-500/20'
                            : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700 hover:border-slate-600'
                          }
                        `}
                      >
                        <span className="flex items-center gap-1.5">
                          {selectedYachtClasses.includes('generic') && <Check size={14} />}
                          Generic
                        </span>
                      </button>

                      {/* Yacht Class Options */}
                      {availableYachtClasses.map(yachtClass => (
                        <button
                          key={yachtClass.id}
                          type="button"
                          onClick={() => handleToggleYachtClass(yachtClass.id)}
                          className={`
                            px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
                            ${selectedYachtClasses.includes(yachtClass.id)
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 ring-2 ring-blue-500/20'
                              : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700 hover:border-slate-600'
                            }
                          `}
                        >
                          <span className="flex items-center gap-1.5">
                            {selectedYachtClasses.includes(yachtClass.id) && <Check size={14} />}
                            {yachtClass.name}
                          </span>
                        </button>
                      ))}
                    </div>
                    {selectedYachtClasses.length === 0 && (
                      <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        At least one class must be selected. Generic will be used as default.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 transition-all hover:border-slate-600/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/20">
                    <ImageIcon size={20} className="text-orange-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Cover Image</h2>
                </div>

                <div
                  className={`
                    relative border-2 border-dashed rounded-lg transition-all cursor-pointer overflow-hidden
                    ${dragActive
                      ? 'border-blue-500 bg-blue-500/10 scale-[1.02]'
                      : coverImage
                        ? 'border-green-500/50 bg-green-500/5'
                        : 'border-slate-600 hover:border-blue-500/50 hover:bg-slate-700/30'}
                  `}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={handleImageClick}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={uploadingImage}
                  />

                  {coverImage || DEFAULT_COVER_IMAGE ? (
                    <div className="relative group">
                      <img
                        src={coverImage || DEFAULT_COVER_IMAGE}
                        alt="Cover preview"
                        className="w-full h-56 object-cover"
                      />
                      {coverImage && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCoverImage('');
                          }}
                          className="absolute top-3 right-3 p-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg opacity-0 group-hover:opacity-100"
                        >
                          <X size={16} />
                        </button>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="text-center">
                          <Upload className="mx-auto h-10 w-10 text-white mb-2" />
                          <p className="text-white font-medium">{coverImage ? 'Click to change image' : 'Click to upload custom image'}</p>
                          {!coverImage && (
                            <p className="text-white/70 text-sm mt-1">Default image will be used</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      {uploadingImage ? (
                        <div className="flex flex-col items-center">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                          <p className="text-slate-300 font-medium">Uploading...</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="mx-auto h-14 w-14 text-slate-500 mb-4" />
                          <p className="text-slate-300 font-medium mb-1.5">
                            Drop image here
                          </p>
                          <p className="text-slate-500 text-sm mb-3">
                            or click to browse
                          </p>
                          <p className="text-slate-600 text-xs">
                            JPG, PNG, WebP or GIF (max. 5MB)
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 transition-all hover:border-slate-600/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20">
                    <AlignLeft size={20} className="text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Excerpt</h2>
                    <p className="text-xs text-slate-400">Optional preview text</p>
                  </div>
                </div>
                <textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800/60 text-white rounded-lg border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-sm placeholder-slate-500 resize-none"
                  placeholder="Brief summary for article previews..."
                  rows={4}
                />
                <p className="mt-2 text-xs text-slate-500">
                  {excerpt.length > 0 ? `${excerpt.length} characters` : 'Auto-generated if left empty'}
                </p>
              </div>

              {availableCommunityGroups.length > 0 && (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 transition-all hover:border-slate-600/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-teal-500/20 to-green-500/20 border border-teal-500/20">
                      <Users size={20} className="text-teal-400" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-white">Publish to Community</h2>
                      <p className="text-xs text-slate-400">Share this article as a post in club groups</p>
                    </div>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer mb-4">
                    <div
                      onClick={() => setPublishToCommunity(p => !p)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${publishToCommunity ? 'bg-teal-500' : 'bg-slate-600'}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${publishToCommunity ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className="text-sm text-slate-300">
                      {publishToCommunity ? 'Will post to selected groups on publish' : 'Off — not posting to community'}
                    </span>
                  </label>

                  {publishToCommunity && (
                    <div className="space-y-2">
                      {availableCommunityGroups.length > 1 && (
                        <p className="text-xs text-slate-400 mb-2">Select which groups to post to:</p>
                      )}
                      {availableCommunityGroups.map(group => (
                        <label
                          key={group.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            communityGroupIds.includes(group.id)
                              ? 'border-teal-500/50 bg-teal-500/10'
                              : 'border-slate-700/50 bg-slate-700/20 hover:border-slate-600'
                          }`}
                          onClick={() => handleToggleCommunityGroup(group.id)}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            communityGroupIds.includes(group.id)
                              ? 'bg-teal-500 border-teal-500'
                              : 'border-slate-500'
                          }`}>
                            {communityGroupIds.includes(group.id) && <Check size={10} className="text-white" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white truncate">{group.name}</div>
                            {group.club_name && (
                              <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Building2 size={10} />
                                {group.club_name}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleConfirmCancel}
        title="Cancel Editing"
        message="Are you sure you want to cancel? Any unsaved changes will be lost."
        confirmText="OK"
        cancelText="Cancel"
        darkMode={true}
      />
    </div>
  );
};

export default ArticleEditorPage;
