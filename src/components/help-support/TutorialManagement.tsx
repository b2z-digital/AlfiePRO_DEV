import { useState, useEffect } from 'react';
import {
  PlayCircle, Plus, Edit2, Trash2, Search, FolderPlus, Save, X,
  Eye, EyeOff, Video, Clock, Tag, ExternalLink, ChevronDown, ChevronRight,
  GripVertical, Monitor, Smartphone, Globe,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { tutorialStorage } from '../../utils/helpSupportStorage';
import { PLATFORM_AREAS, DIFFICULTY_LEVELS } from '../../types/helpSupport';
import type { SupportTutorialGroup, SupportTutorial } from '../../types/helpSupport';

interface Props {
  darkMode?: boolean;
  onNotify: (message: string, type: 'success' | 'error') => void;
}

export default function TutorialManagement({ darkMode = false, onNotify }: Props) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<SupportTutorialGroup[]>([]);
  const [tutorials, setTutorials] = useState<SupportTutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SupportTutorialGroup | null>(null);
  const [editingTutorial, setEditingTutorial] = useState<SupportTutorial | null>(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);

  const [groupForm, setGroupForm] = useState({
    name: '', description: '', icon: 'PlayCircle', cover_image_url: '',
    platform_section: 'general', target_audience: 'all', target_platform: 'both',
    is_active: true, sort_order: 0,
  });

  const [tutorialForm, setTutorialForm] = useState({
    group_id: '' as string | null, title: '', description: '',
    youtube_url: '', youtube_video_id: '', thumbnail_url: '',
    duration_seconds: 0, difficulty_level: 'beginner' as string,
    platform_area: 'general', target_platform: 'both',
    tags: [] as string[], is_published: false, sort_order: 0,
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [grps, tuts] = await Promise.all([
        tutorialStorage.getGroups(),
        tutorialStorage.getTutorials(),
      ]);
      setGroups(grps);
      setTutorials(tuts);
      if (grps.length > 0 && expandedGroups.size === 0) {
        setExpandedGroups(new Set([grps[0].id]));
      }
    } catch (err: any) {
      onNotify(err.message || 'Failed to load tutorials', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openGroupModal = (group?: SupportTutorialGroup) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({
        name: group.name, description: group.description, icon: group.icon,
        cover_image_url: group.cover_image_url || '',
        platform_section: group.platform_section || 'general',
        target_audience: group.target_audience || 'all',
        target_platform: group.target_platform || 'both',
        is_active: group.is_active, sort_order: group.sort_order,
      });
    } else {
      setEditingGroup(null);
      setGroupForm({
        name: '', description: '', icon: 'PlayCircle', cover_image_url: '',
        platform_section: 'general', target_audience: 'all', target_platform: 'both',
        is_active: true, sort_order: groups.length,
      });
    }
    setShowGroupModal(true);
  };

  const saveGroup = async () => {
    if (!groupForm.name.trim()) { onNotify('Group name is required', 'error'); return; }
    try {
      if (editingGroup) {
        await tutorialStorage.updateGroup(editingGroup.id, groupForm);
        onNotify('Group updated', 'success');
      } else {
        await tutorialStorage.createGroup({ ...groupForm, created_by: user?.id });
        onNotify('Group created', 'success');
      }
      setShowGroupModal(false);
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to save group', 'error');
    }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this group and all its tutorials?')) return;
    try {
      await tutorialStorage.deleteGroup(id);
      onNotify('Group deleted', 'success');
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to delete group', 'error');
    }
  };

  const openTutorialModal = (tutorial?: SupportTutorial, groupId?: string) => {
    if (tutorial) {
      setEditingTutorial(tutorial);
      setTutorialForm({
        group_id: tutorial.group_id, title: tutorial.title,
        description: tutorial.description || '', youtube_url: tutorial.youtube_url || '',
        youtube_video_id: tutorial.youtube_video_id, thumbnail_url: tutorial.thumbnail_url || '',
        duration_seconds: tutorial.duration_seconds, difficulty_level: tutorial.difficulty_level,
        platform_area: tutorial.platform_area || 'general',
        target_platform: tutorial.target_platform || 'both',
        tags: tutorial.tags || [], is_published: tutorial.is_published,
        sort_order: tutorial.sort_order,
      });
    } else {
      setEditingTutorial(null);
      setTutorialForm({
        group_id: groupId || null, title: '', description: '',
        youtube_url: '', youtube_video_id: '', thumbnail_url: '',
        duration_seconds: 0, difficulty_level: 'beginner',
        platform_area: 'general', target_platform: 'both',
        tags: [], is_published: false,
        sort_order: tutorials.filter(t => t.group_id === groupId).length,
      });
    }
    setTagInput('');
    setShowTutorialModal(true);
  };

  const handleYouTubeUrlChange = (url: string) => {
    const videoId = tutorialStorage.extractYouTubeId(url);
    setTutorialForm(prev => ({
      ...prev,
      youtube_url: url,
      youtube_video_id: videoId || '',
      thumbnail_url: videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : '',
    }));
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tutorialForm.tags.includes(t)) {
      setTutorialForm(prev => ({ ...prev, tags: [...prev.tags, t] }));
    }
    setTagInput('');
  };

  const saveTutorial = async () => {
    if (!tutorialForm.title.trim()) { onNotify('Title is required', 'error'); return; }
    if (!tutorialForm.youtube_video_id) { onNotify('A valid YouTube URL is required', 'error'); return; }
    try {
      if (editingTutorial) {
        await tutorialStorage.updateTutorial(editingTutorial.id, tutorialForm);
        onNotify('Tutorial updated', 'success');
      } else {
        await tutorialStorage.createTutorial({ ...tutorialForm, created_by: user?.id });
        onNotify('Tutorial created', 'success');
      }
      setShowTutorialModal(false);
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to save tutorial', 'error');
    }
  };

  const deleteTutorial = async (id: string) => {
    if (!confirm('Delete this tutorial?')) return;
    try {
      await tutorialStorage.deleteTutorial(id);
      onNotify('Tutorial deleted', 'success');
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to delete tutorial', 'error');
    }
  };

  const togglePublished = async (tutorial: SupportTutorial) => {
    try {
      await tutorialStorage.updateTutorial(tutorial.id, { is_published: !tutorial.is_published });
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to update tutorial', 'error');
    }
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const platformIcon = (p: string) => {
    if (p === 'web') return <Monitor size={14} />;
    if (p === 'mobile') return <Smartphone size={14} />;
    return <Globe size={14} />;
  };

  const filteredTutorials = searchQuery
    ? tutorials.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tags?.some(tag => tag.includes(searchQuery.toLowerCase()))
      )
    : tutorials;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Tutorial Management</h2>
          <p className="text-sm text-slate-400 mt-1">{tutorials.length} tutorials in {groups.length} groups</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tutorials..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 w-64"
            />
          </div>
          <button onClick={() => openGroupModal()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">
            <FolderPlus size={16} />
            Add Group
          </button>
          <button onClick={() => openTutorialModal()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm transition-colors">
            <Plus size={16} />
            Add Tutorial
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {groups.map(group => {
          const groupTutorials = filteredTutorials.filter(t => t.group_id === group.id);
          const isExpanded = expandedGroups.has(group.id);
          return (
            <div key={group.id} className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                onClick={() => toggleGroup(group.id)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  <PlayCircle size={18} className="text-sky-400" />
                  <span className="font-semibold text-white">{group.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{groupTutorials.length}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 flex items-center gap-1">
                    {platformIcon(group.target_platform)} {group.target_platform === 'both' ? 'All' : group.target_platform}
                  </span>
                  {!group.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Hidden</span>}
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openTutorialModal(undefined, group.id)} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors">
                    <Plus size={16} />
                  </button>
                  <button onClick={() => openGroupModal(group)} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => deleteGroup(group.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-slate-700/50">
                  {groupTutorials.length === 0 ? (
                    <div className="px-5 py-8 text-center text-slate-500 text-sm">
                      No tutorials in this group yet.
                      <button onClick={() => openTutorialModal(undefined, group.id)} className="text-sky-400 hover:text-sky-300 ml-1">Add one</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
                      {groupTutorials.map(tutorial => (
                        <TutorialCard
                          key={tutorial.id}
                          tutorial={tutorial}
                          onEdit={() => openTutorialModal(tutorial)}
                          onDelete={() => deleteTutorial(tutorial.id)}
                          onTogglePublish={() => togglePublished(tutorial)}
                          onPreview={() => setPreviewVideoId(tutorial.youtube_video_id)}
                          formatDuration={formatDuration}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {previewVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setPreviewVideoId(null)}>
          <div className="w-full max-w-4xl aspect-video rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${previewVideoId}?autoplay=1&rel=0&modestbranding=1`}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="Tutorial Preview"
            />
          </div>
          <button onClick={() => setPreviewVideoId(null)} className="absolute top-6 right-6 p-2 rounded-full bg-black/50 text-white hover:bg-black/70">
            <X size={24} />
          </button>
        </div>
      )}

      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-bold text-white">{editingGroup ? 'Edit Group' : 'New Tutorial Group'}</h3>
              <button onClick={() => setShowGroupModal(false)} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Group Name</label>
                <input
                  type="text"
                  value={groupForm.name}
                  onChange={e => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="e.g., Race Management Tutorials"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={groupForm.description}
                  onChange={e => setGroupForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500 h-20 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Platform Section</label>
                  <select
                    value={groupForm.platform_section}
                    onChange={e => setGroupForm(prev => ({ ...prev, platform_section: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {PLATFORM_AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Target Platform</label>
                  <select
                    value={groupForm.target_platform}
                    onChange={e => setGroupForm(prev => ({ ...prev, target_platform: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="both">Both (Web & Mobile)</option>
                    <option value="web">Web Platform Only</option>
                    <option value="mobile">Mobile App Only</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Target Audience</label>
                <select
                  value={groupForm.target_audience}
                  onChange={e => setGroupForm(prev => ({ ...prev, target_audience: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All Users</option>
                  <option value="admin">Club Administrators</option>
                  <option value="member">Members</option>
                  <option value="race_officer">Race Officers</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Cover Image URL</label>
                <input
                  type="text"
                  value={groupForm.cover_image_url}
                  onChange={e => setGroupForm(prev => ({ ...prev, cover_image_url: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="https://..."
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupForm.is_active}
                  onChange={e => setGroupForm(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-600 text-sky-500 focus:ring-sky-500 bg-slate-700"
                />
                <span className="text-sm text-slate-300">Active (visible to users)</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <button onClick={() => setShowGroupModal(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">Cancel</button>
              <button onClick={saveGroup} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm">
                <Save size={16} />
                {editingGroup ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTutorialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
              <h3 className="text-lg font-bold text-white">{editingTutorial ? 'Edit Tutorial' : 'New Tutorial'}</h3>
              <button onClick={() => setShowTutorialModal(false)} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">YouTube URL</label>
                <input
                  type="text"
                  value={tutorialForm.youtube_url}
                  onChange={e => handleYouTubeUrlChange(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                {tutorialForm.youtube_video_id && (
                  <div className="mt-3 rounded-lg overflow-hidden aspect-video max-w-sm">
                    <img
                      src={tutorialForm.thumbnail_url}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${tutorialForm.youtube_video_id}/hqdefault.jpg`; }}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  value={tutorialForm.title}
                  onChange={e => setTutorialForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Tutorial title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={tutorialForm.description}
                  onChange={e => setTutorialForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500 h-24 resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Group</label>
                  <select
                    value={tutorialForm.group_id || ''}
                    onChange={e => setTutorialForm(prev => ({ ...prev, group_id: e.target.value || null }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">No Group</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Difficulty</label>
                  <select
                    value={tutorialForm.difficulty_level}
                    onChange={e => setTutorialForm(prev => ({ ...prev, difficulty_level: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {DIFFICULTY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Duration (sec)</label>
                  <input
                    type="number"
                    value={tutorialForm.duration_seconds}
                    onChange={e => setTutorialForm(prev => ({ ...prev, duration_seconds: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Platform Area</label>
                  <select
                    value={tutorialForm.platform_area}
                    onChange={e => setTutorialForm(prev => ({ ...prev, platform_area: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {PLATFORM_AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Target Platform</label>
                  <select
                    value={tutorialForm.target_platform}
                    onChange={e => setTutorialForm(prev => ({ ...prev, target_platform: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="both">Both</option>
                    <option value="web">Web</option>
                    <option value="mobile">Mobile</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tags</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    className="flex-1 px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Add tag..."
                  />
                  <button onClick={addTag} className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"><Tag size={16} /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tutorialForm.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs">
                      {tag}
                      <button onClick={() => setTutorialForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))} className="hover:text-white"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tutorialForm.is_published}
                    onChange={e => setTutorialForm(prev => ({ ...prev, is_published: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 text-sky-500 focus:ring-sky-500 bg-slate-700"
                  />
                  <span className="text-sm text-slate-300">Published</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700 sticky bottom-0 bg-slate-800">
              <button onClick={() => setShowTutorialModal(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">Cancel</button>
              <button onClick={saveTutorial} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm">
                <Save size={16} />
                {editingTutorial ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TutorialCard({ tutorial, onEdit, onDelete, onTogglePublish, onPreview, formatDuration }: {
  tutorial: SupportTutorial;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
  onPreview: () => void;
  formatDuration: (s: number) => string;
}) {
  const diffColor = DIFFICULTY_LEVELS.find(d => d.value === tutorial.difficulty_level)?.color || 'bg-slate-500';
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/80 overflow-hidden group hover:border-slate-600 transition-colors">
      <div className="relative aspect-video bg-slate-900 cursor-pointer" onClick={onPreview}>
        {tutorial.thumbnail_url ? (
          <img src={tutorial.thumbnail_url} alt={tutorial.title} className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full"><Video size={32} className="text-slate-600" /></div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
          <PlayCircle size={48} className="text-white drop-shadow-lg" />
        </div>
        {tutorial.duration_seconds > 0 && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-xs flex items-center gap-1">
            <Clock size={12} /> {formatDuration(tutorial.duration_seconds)}
          </span>
        )}
        <span className={`absolute top-2 left-2 px-2 py-0.5 rounded text-white text-xs ${diffColor}`}>
          {tutorial.difficulty_level}
        </span>
      </div>
      <div className="p-3">
        <h4 className="text-sm font-semibold text-white truncate">{tutorial.title}</h4>
        {tutorial.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{tutorial.description}</p>}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Eye size={12} /> {tutorial.view_count}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onTogglePublish} className={`p-1 rounded transition-colors ${tutorial.is_published ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-slate-500 hover:bg-slate-600'}`}>
              {tutorial.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button onClick={onPreview} className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors">
              <ExternalLink size={14} />
            </button>
            <button onClick={onEdit} className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
