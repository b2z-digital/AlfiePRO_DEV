import React, { useState, useEffect } from 'react';
import { Layout, PanelBottom, Eye, EyeOff, Save, Loader2, CheckCircle } from 'lucide-react';
import { eventPageBuilderStorage } from '../../utils/eventPageBuilderStorage';
import type { EventGlobalSection } from '../../types/eventWidgets';
import { UnifiedHeaderNavigationEditor } from './UnifiedHeaderNavigationEditor';
import { EventFooterEditor } from './EventFooterEditor';
import { useNotifications } from '../../contexts/NotificationContext';

interface Props {
  websiteId: string;
  darkMode?: boolean;
}

type SectionTab = 'header_nav' | 'footer';

export const EventWebsiteGlobalSectionsManager: React.FC<Props> = ({ websiteId, darkMode = true }) => {
  const [activeTab, setActiveTab] = useState<SectionTab>('header_nav');
  const [sections, setSections] = useState<{
    header: EventGlobalSection | null;
    menu: EventGlobalSection | null;
    footer: EventGlobalSection | null;
  }>({
    header: null,
    menu: null,
    footer: null
  });
  const [localHeaderConfig, setLocalHeaderConfig] = useState<Record<string, any>>({});
  const [localMenuConfig, setLocalMenuConfig] = useState<Record<string, any>>({});
  const [localFooterConfig, setLocalFooterConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadSections();
  }, [websiteId]);

  const loadSections = async () => {
    setLoading(true);
    try {
      const allSections = await eventPageBuilderStorage.getAllGlobalSections(websiteId);

      const sectionsMap = {
        header: allSections.find(s => s.section_type === 'header') || null,
        menu: allSections.find(s => s.section_type === 'menu') || null,
        footer: allSections.find(s => s.section_type === 'footer') || null
      };

      setSections(sectionsMap);
      setLocalHeaderConfig(sectionsMap.header?.config || {});
      setLocalMenuConfig(sectionsMap.menu?.config || {});
      setLocalFooterConfig(sectionsMap.footer?.config || {});
    } catch (error) {
      console.error('Error loading sections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSection = async (sectionType: 'header' | 'menu' | 'footer') => {
    const section = sections[sectionType];
    const newEnabled = !section?.enabled;

    const success = await eventPageBuilderStorage.toggleGlobalSection(websiteId, sectionType, newEnabled);

    if (success) {
      setSections(prev => ({
        ...prev,
        [sectionType]: prev[sectionType] ? { ...prev[sectionType]!, enabled: newEnabled } : null
      }));
      addNotification(`${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)} ${newEnabled ? 'enabled' : 'disabled'}`, 'success');
    }
  };

  const handleSaveHeaderNavigation = async (headerConfig: Record<string, any>, menuConfig: Record<string, any>) => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const [headerSuccess, menuSuccess] = await Promise.all([
        eventPageBuilderStorage.saveGlobalSection({
          event_website_id: websiteId,
          section_type: 'header',
          enabled: sections.header?.enabled !== false,
          config: headerConfig
        }),
        eventPageBuilderStorage.saveGlobalSection({
          event_website_id: websiteId,
          section_type: 'menu',
          enabled: sections.menu?.enabled !== false,
          config: menuConfig
        })
      ]);

      if (headerSuccess && menuSuccess) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        await loadSections();
        addNotification('Header & Navigation saved successfully!', 'success');
      } else {
        addNotification('Failed to save. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error saving header/navigation:', error);
      addNotification('error', `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFooter = async (config: Record<string, any>) => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const success = await eventPageBuilderStorage.saveGlobalSection({
        event_website_id: websiteId,
        section_type: 'footer',
        enabled: sections.footer?.enabled !== false,
        config
      });

      if (success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        await loadSections();
        addNotification('Footer saved successfully!', 'success');
      } else {
        addNotification('Failed to save footer. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error saving footer:', error);
      addNotification(`Failed to save footer: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Compact Tab Switcher */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('header_nav')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
              activeTab === 'header_nav'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Layout size={16} />
            Header & Navigation
            {(sections.header?.enabled || sections.menu?.enabled) && (
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
            )}
          </button>

          <button
            onClick={() => setActiveTab('footer')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
              activeTab === 'footer'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <PanelBottom size={16} />
            Footer
            {sections.footer?.enabled && (
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
            )}
          </button>
        </div>

        {/* Save Status */}
        {saveSuccess && (
          <div className="flex items-center gap-2 text-emerald-400 animate-in fade-in">
            <CheckCircle size={16} />
            <span className="text-sm font-medium">Saved!</span>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'header_nav' && (
          <div>
            <UnifiedHeaderNavigationEditor
              websiteId={websiteId}
              headerConfig={localHeaderConfig}
              menuConfig={localMenuConfig}
              onHeaderChange={(headerConfig) => {
                setLocalHeaderConfig(headerConfig);
              }}
              onMenuChange={(menuConfig) => {
                setLocalMenuConfig(menuConfig);
              }}
              darkMode={darkMode}
            />

            {/* Save Button */}
            <div className="flex justify-end pt-6 mt-6">
              <button
                onClick={() => handleSaveHeaderNavigation(localHeaderConfig, localMenuConfig)}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg"
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>Save Header & Navigation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'footer' && (
          <div className="space-y-4">
            {/* Toggle Control */}
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700">
              <button
                onClick={() => handleToggleSection('footer')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  sections.footer?.enabled
                    ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {sections.footer?.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>Footer</span>
              </button>
            </div>

            {/* Footer Editor */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Footer</h3>
              <EventFooterEditor
                websiteId={websiteId}
                config={localFooterConfig}
                onSave={(footerConfig) => {
                  setLocalFooterConfig(footerConfig);
                }}
                darkMode={darkMode}
                saving={saving}
              />
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-slate-700 sticky bottom-0 bg-slate-800 -mx-6 px-6 py-3">
              <button
                onClick={() => handleSaveFooter(localFooterConfig)}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
