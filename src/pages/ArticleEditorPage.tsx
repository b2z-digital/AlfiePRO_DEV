import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, X, Plus, TriangleAlert as AlertTriangle, Check, Upload, Eye } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { WysiwygEditor } from '../components/ui/WysiwygEditor';
import { getArticleById, createArticle, updateArticle, Article } from '../utils/articleStorage';
import { useNotifications } from '../contexts/NotificationContext';
import { supabase } from '../utils/supabase';
import { v4 as uuidv4 } from 'uuid';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { AlfieIcon } from '../components/brand/AlfieIcon';
import { ASwitch, useAlfieLight } from '../components/alfie/Kit';
import { SmartImage } from '../components/news/SmartImage';
import { NewsCard } from '../components/news/NewsCard';
import { stripHtml } from '../components/news/newsUtils';

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
  const light = useAlfieLight();
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Headline box grows with the text
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title, loading]);

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
        // For association users: fetch all clubs' groups under that association
        // For club users: fetch own club group
        // NOTE: check association FIRST — a state/national admin may also have a currentClub set
        const orgId = currentOrganization?.id;
        const clubId = currentClub?.clubId;

        if (orgId && currentOrganization?.type) {
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
        } else if (clubId) {
          const { data: groups } = await supabase
            .from('social_groups')
            .select('id, name')
            .eq('club_id', clubId)
            .order('name');
          if (groups) {
            setAvailableCommunityGroups(groups);
            if (groups.length > 0) setCommunityGroupIds([groups[0].id]);
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
        club_id: isAssociation ? undefined : currentClub?.clubId,
        state_association_id: isAssociation && currentOrganization?.type === 'state' ? currentOrganization.id : undefined,
        national_association_id: isAssociation && currentOrganization?.type === 'national' ? currentOrganization.id : undefined,
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
    } catch (err: any) {
      console.error('Error saving article:', err);
      const supabaseMessage = err?.message || err?.error_description || '';
      if (supabaseMessage.includes('row-level security') || supabaseMessage.includes('policy') || err?.code === '42501') {
        setError('Permission denied. Please make sure you are viewing the correct club or association before creating an article.');
      } else if (supabaseMessage.includes('0 rows') || err?.code === 'PGRST116') {
        setError('Permission denied. You may not have the required role to save articles for this organization.');
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred while saving the article');
      }
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
      <div className="a-nw-editor">
        <div className="a-nw-ed-grid" aria-busy="true" aria-label="Loading article">
          <div className="a-nw-ed-main">
            <span className="a-nw-shim a-nw-ed-cover" />
            <span className="a-nw-shim" style={{ height: 44, width: '70%', borderRadius: 12 }} />
            <span className="a-nw-shim" style={{ height: 18, width: '45%' }} />
            <span className="a-nw-shim" style={{ height: 420, borderRadius: 20 }} />
          </div>
          <div className="a-nw-ed-side">
            <span className="a-nw-shim" style={{ height: 150, borderRadius: 20 }} />
            <span className="a-nw-shim" style={{ height: 220, borderRadius: 20 }} />
          </div>
        </div>
      </div>
    );
  }

  const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length;
  const readingTime = Math.ceil(wordCount / 200);
  const backToEvent = !!(eventWebsiteId && eventId);
  const allGroupsSelected = availableCommunityGroups.every(g => communityGroupIds.includes(g.id));
  const previewArticle = {
    id: id && id !== 'new' ? id : 'new-article',
    title: title.trim() || 'Your headline goes here',
    content,
    excerpt: excerpt.trim() || (stripHtml(content).slice(0, 150) || 'A short summary of the story appears here.'),
    cover_image: coverImage || DEFAULT_COVER_IMAGE,
    tags,
    status: 'published',
    published_at: new Date().toISOString(),
    author_name: `${(user as any)?.user_metadata?.first_name || ''} ${(user as any)?.user_metadata?.last_name || ''}`.trim() || 'You',
    source_type: currentOrganization && !currentClub ? currentOrganization.type : 'club',
    event_name: eventName || undefined,
  } as Article;

  return (
    <div className="a-nw-editor">
      {/* Action bar */}
      <div className="a-nw-ed-bar">
        <button
          onClick={() => backToEvent ? navigate(`/event-websites/${eventId}`) : navigate('/news')}
          className="a-btn a-btn-q a-nw-rd-back"
        >
          <ArrowLeft size={17} />
          <span className="a-nw-ed-hide-sm">{eventName ? 'Event Website' : 'News'}</span>
        </button>
        {eventName && (
          <span className="a-nw-event a-nw-ed-hide-sm"><AlfieIcon glyph="flag" size={13} />{eventName}</span>
        )}
        <div className="a-nw-ed-status">
          <span className={`a-light ${isPublished ? 'a-light-g' : 'a-light-a'}`} />
          <b>{isPublished ? 'Published' : 'Draft'}</b>
          <span className="a-nw-ed-hide-sm">
            <i className="a-nw-sep" aria-hidden="true" />{wordCount} words
            <i className="a-nw-sep" aria-hidden="true" />{readingTime} min read
          </span>
          {uploadingInlineImage && (
            <span className="a-nw-ed-uploading"><span className="a-nw-spin" />Uploading image…</span>
          )}
        </div>
        <div className="a-nw-ed-acts">
          <button onClick={handleCancel} className="a-btn a-btn-q a-nw-ed-hide-sm" disabled={saving}>
            Cancel
          </button>
          <button onClick={() => handleSave(false)} className="a-btn" disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave(true)} className="a-btn a-btn-p" disabled={saving}>
            <AlfieIcon glyph="send" size={16} />
            {saving ? 'Publishing...' : isPublished ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>

      {(error || success) && (
        <div className="a-nw-ed-msgs">
          {error && (
            <div className="a-nw-ed-msg a-nw-ed-msg-r" role="alert">
              <AlfieIcon glyph="warn" size={18} />
              <p>{error}</p>
            </div>
          )}
          {success && (
            <div className="a-nw-ed-msg a-nw-ed-msg-g" role="status">
              <AlfieIcon glyph="check" size={18} />
              <p>{success}</p>
            </div>
          )}
        </div>
      )}

      <div className="a-nw-ed-grid">
        <div className="a-nw-ed-main">
          {/* Cover */}
          <div
            className={`a-nw-ed-cover group ${dragActive ? 'is-drag' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={handleImageClick}
            role="button"
            tabIndex={0}
            aria-label={coverImage ? 'Change cover image' : 'Upload a cover image'}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleImageClick(); } }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploadingImage}
            />
            <SmartImage src={coverImage || DEFAULT_COVER_IMAGE} alt="Cover preview" eager />
            <div className="a-nw-ed-cover-shade" />
            <div className="a-nw-ed-cover-tl">
              {coverImage ? (
                <span className="a-nw-glass-tag"><AlfieIcon glyph="image" size={13} />Cover image</span>
              ) : (
                <span className="a-nw-glass-tag"><AlfieIcon glyph="image" size={13} />Default cover will be used</span>
              )}
            </div>
            <div className="a-nw-ed-cover-tr">
              <span className="a-nw-gb a-nw-ed-cover-btn"><Upload size={15} />{coverImage ? 'Change' : 'Upload cover'}</span>
              {coverImage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCoverImage('');
                  }}
                  className="a-nw-gb a-nw-gb-d"
                  aria-label="Remove cover image"
                  title="Remove cover image"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="a-nw-ed-drop">
              <span className="a-nw-ed-drop-ic"><Upload size={22} /></span>
              <b>Drop image here</b>
              <span>or click to browse · JPG, PNG, WebP or GIF (max. 5MB)</span>
            </div>
            {uploadingImage && (
              <div className="a-nw-ed-busy"><span className="a-nw-spin a-nw-spin-lg" />Uploading...</div>
            )}
          </div>

          {/* Headline and summary */}
          <div className="a-nw-ed-head">
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/[\r\n]+/g, ' '))}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              className="a-nw-ed-title"
              placeholder="Article title"
              aria-label="Article title"
              rows={1}
            />
            <div className="a-nw-ed-hints">
              <span>{title.length} characters</span>
              {title.length > 0 && (
                <span className={title.length > 60 ? 'a-txt-a' : 'a-txt-g'}>
                  <Check size={13} />
                  {title.length > 60 ? 'Title is quite long' : 'Good length'}
                </span>
              )}
            </div>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className="a-nw-ed-dek"
              placeholder="Add a short summary for the news card (optional)"
              aria-label="Excerpt"
              rows={2}
            />
            <div className="a-nw-ed-hints">
              <span>{excerpt.length > 0 ? `${excerpt.length} characters` : 'Auto-generated if left empty'}</span>
            </div>
          </div>

          {/* Body */}
          <div className="a-nw-ed-editor">
            <WysiwygEditor
              value={content}
              onChange={setContent}
              darkMode={!light}
              height={600}
              placeholder="Start writing your article content here..."
              onImageUpload={handleInlineImageUpload}
            />
          </div>
        </div>

        <aside className="a-nw-ed-side">
          {/* Publishing */}
          <section className="a-nw-ed-card">
            <div className="a-nw-ed-card-h">
              <span className="a-tile a-tile-sm"><AlfieIcon glyph="send" size={16} /></span>
              <h2>Publishing</h2>
              <span className={`a-nw-ed-pill ${isPublished ? 'is-live' : ''}`}>{isPublished ? 'Published' : 'Draft'}</span>
            </div>
            <p className="a-nw-ed-note">
              {isPublished
                ? 'Article is live and visible to members'
                : 'Save as draft or publish when ready'}
            </p>

            {availableCommunityGroups.length > 0 && (
              <div className="a-nw-ed-sub">
                <div className="a-nw-ed-row">
                  <div className="min-w-0 flex-1">
                    <b>Publish to Community</b>
                    <span>Share as a post in club groups when published</span>
                  </div>
                  <ASwitch checked={publishToCommunity} onChange={() => setPublishToCommunity(p => !p)} label="Publish to Community" />
                </div>

                {publishToCommunity && (
                  <div className="a-nw-ed-groups">
                    {availableCommunityGroups.length > 1 && (
                      <div className="a-nw-ed-groups-h">
                        <span>Select groups to post to</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (allGroupsSelected) {
                              setCommunityGroupIds([]);
                            } else {
                              setCommunityGroupIds(availableCommunityGroups.map(g => g.id));
                            }
                          }}
                          className="a-nw-ed-link"
                        >
                          {allGroupsSelected ? 'Deselect All' : 'Select All Clubs'}
                        </button>
                      </div>
                    )}
                    {availableCommunityGroups.map(group => {
                      const on = communityGroupIds.includes(group.id);
                      return (
                        <button
                          type="button"
                          key={group.id}
                          className={`a-nw-ed-group ${on ? 'is-on' : ''}`}
                          onClick={() => handleToggleCommunityGroup(group.id)}
                          aria-pressed={on}
                        >
                          <span className={`a-chk ${on ? 'a-chk-on' : ''}`}>{on && <Check size={12} />}</span>
                          <span className="min-w-0 text-left">
                            <b>{group.name}</b>
                            {group.club_name && <span>{group.club_name}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Classes */}
          <section className="a-nw-ed-card">
            <div className="a-nw-ed-card-h">
              <span className="a-tile a-tile-sm"><AlfieIcon glyph="boat" size={16} /></span>
              <h2>Yacht Classes</h2>
            </div>
            <p className="a-nw-ed-note">Select which yacht classes this article relates to, or keep as Generic for all classes</p>
            <div className="a-nw-ed-chips">
              <button
                type="button"
                onClick={() => handleToggleYachtClass('generic')}
                className={`a-nw-ed-chip ${selectedYachtClasses.includes('generic') ? 'is-on is-generic' : ''}`}
                aria-pressed={selectedYachtClasses.includes('generic')}
              >
                {selectedYachtClasses.includes('generic') && <Check size={13} />}
                Generic
              </button>
              {availableYachtClasses.map(yachtClass => (
                <button
                  key={yachtClass.id}
                  type="button"
                  onClick={() => handleToggleYachtClass(yachtClass.id)}
                  className={`a-nw-ed-chip ${selectedYachtClasses.includes(yachtClass.id) ? 'is-on' : ''}`}
                  aria-pressed={selectedYachtClasses.includes(yachtClass.id)}
                >
                  {selectedYachtClasses.includes(yachtClass.id) && <Check size={13} />}
                  {yachtClass.name}
                </button>
              ))}
            </div>
            {selectedYachtClasses.length === 0 && (
              <p className="a-nw-ed-warn">
                <AlertTriangle size={12} />
                At least one class must be selected. Generic will be used as default.
              </p>
            )}
          </section>

          {/* Tags */}
          <section className="a-nw-ed-card">
            <div className="a-nw-ed-card-h">
              <span className="a-tile a-tile-sm"><AlfieIcon glyph="tag" size={16} /></span>
              <h2>Tags</h2>
            </div>
            <div className="a-nw-ed-chips">
              {tags.map(tag => (
                <span key={tag} className="a-nw-ed-tag">
                  #{tag}
                  <button onClick={() => handleRemoveTag(tag)} aria-label={`Remove tag ${tag}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              {tags.length === 0 && (
                <span className="a-nw-ed-note m-0">No tags added</span>
              )}
            </div>
            <div className="a-nw-ed-tagadd">
              <label className="a-field">
                <AlfieIcon glyph="tag" size={15} />
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add a tag..."
                />
              </label>
              <button onClick={handleAddTag} className="a-btn" aria-label="Add tag">
                <Plus size={16} />
              </button>
            </div>
          </section>

          {/* Live card preview */}
          <section className="a-nw-ed-card a-nw-ed-preview">
            <div className="a-nw-ed-card-h">
              <span className="a-tile a-tile-sm"><Eye size={16} /></span>
              <h2>Card preview</h2>
            </div>
            <p className="a-nw-ed-note">How this story appears in the news feed</p>
            <div className="a-nw-ed-preview-card" aria-hidden="true">
              <NewsCard article={previewArticle} onOpen={() => {}} preview />
            </div>
          </section>
        </aside>
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
