import React, { useState, useEffect } from 'react';
import { Settings, Plus, Save, Wind, Waves, Star, Trash2, Copy, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '../../../utils/supabase';

interface RigTuningTabProps {
  boatId: string;
  boatType: string;
  darkMode: boolean;
  onUpdate: () => void;
}

interface BoatRig {
  id: string;
  boat_id: string;
  name: string;
  description?: string;
  is_default: boolean;
  sail_configuration?: any;
  times_used: number;
  avg_performance_rating?: number;
  created_at: string;
  updated_at: string;
}

interface RigCondition {
  id: string;
  rig_id: string;
  wind_condition: 'light' | 'medium' | 'strong';
  water_condition: 'flat' | 'moderate' | 'rough';
  settings: RigSettings;
  notes?: string;
  performance_rating?: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface RigSettings {
  vang: number;
  shroud: number;
  jibTwist: number;
  rakeDatum: number;
  jibOuthaul: number;
  mainsTwist: number;
  staticRake: number;
  ramPosition: number;
  jibFootDepth: number;
  mainsOuthaul: number;
  mainsFootDepth: number;
  notes: string;
  customFields: Record<string, any>;
}

const defaultSettings: RigSettings = {
  vang: 0,
  shroud: 0,
  jibTwist: 0,
  rakeDatum: 0,
  jibOuthaul: 0,
  mainsTwist: 0,
  staticRake: 0,
  ramPosition: 0,
  jibFootDepth: 0,
  mainsOuthaul: 0,
  mainsFootDepth: 0,
  notes: '',
  customFields: {}
};

export const RigTuningTab: React.FC<RigTuningTabProps> = ({ boatId, boatType, darkMode, onUpdate }) => {
  const [rigs, setRigs] = useState<BoatRig[]>([]);
  const [selectedRig, setSelectedRig] = useState<BoatRig | null>(null);
  const [rigConditions, setRigConditions] = useState<RigCondition[]>([]);
  const [selectedCondition, setSelectedCondition] = useState<RigCondition | null>(null);
  const [windCondition, setWindCondition] = useState<'light' | 'medium' | 'strong'>('medium');
  const [waterCondition, setWaterCondition] = useState<'flat' | 'moderate' | 'rough'>('moderate');
  const [settings, setSettings] = useState<RigSettings>(defaultSettings);
  const [notes, setNotes] = useState('');
  const [performanceRating, setPerformanceRating] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewRigModal, setShowNewRigModal] = useState(false);
  const [newRigName, setNewRigName] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [tuningGuideUrl, setTuningGuideUrl] = useState<string | null>(null);
  const [tuningGuideFileName, setTuningGuideFileName] = useState<string | null>(null);

  useEffect(() => {
    loadBoatTuningGuide();
  }, [boatId]);

  const loadBoatTuningGuide = async () => {
    try {
      const { data, error } = await supabase
        .from('member_boats')
        .select('tuning_guide_url, tuning_guide_file_name')
        .eq('id', boatId)
        .single();

      if (error) throw error;
      if (data) {
        setTuningGuideUrl(data.tuning_guide_url);
        setTuningGuideFileName(data.tuning_guide_file_name);
      }
    } catch (err) {
      console.error('Error loading tuning guide:', err);
    }
  };

  useEffect(() => {
    loadRigs();
  }, [boatId]);

  useEffect(() => {
    if (selectedRig) {
      loadRigConditions(selectedRig.id);
    }
  }, [selectedRig]);

  useEffect(() => {
    if (selectedRig) {
      const condition = rigConditions.find(
        rc => rc.wind_condition === windCondition && rc.water_condition === waterCondition
      );
      setSelectedCondition(condition || null);
      if (condition) {
        setSettings(condition.settings);
        setNotes(condition.notes || '');
        setPerformanceRating(condition.performance_rating);
      } else {
        setSettings(defaultSettings);
        setNotes('');
        setPerformanceRating(undefined);
      }
    }
  }, [windCondition, waterCondition, rigConditions]);

  const loadRigs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('boat_rigs')
        .select('*')
        .eq('boat_id', boatId);

      if (error) throw error;

      const sortedRigs = (data || []).sort((a, b) => {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      setRigs(sortedRigs);
      if (sortedRigs.length > 0) {
        setSelectedRig(sortedRigs[0]);
      }
    } catch (error) {
      console.error('Error loading rigs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRigConditions = async (rigId: string) => {
    try {
      const { data, error } = await supabase
        .from('rig_conditions')
        .select('*')
        .eq('rig_id', rigId);

      if (error) throw error;
      setRigConditions(data || []);
    } catch (error) {
      console.error('Error loading rig conditions:', error);
    }
  };

  const createNewRig = async () => {
    if (!newRigName.trim()) return;

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from('boat_rigs')
        .insert({
          boat_id: boatId,
          name: newRigName,
          is_default: rigs.length === 0,
          sail_configuration: {}
        })
        .select()
        .single();

      if (error) throw error;

      await loadRigs();
      setSelectedRig(data);
      setShowNewRigModal(false);
      setNewRigName('');
    } catch (error) {
      console.error('Error creating rig:', error);
    } finally {
      setSaving(false);
    }
  };

  const saveRigCondition = async () => {
    if (!selectedRig) return;

    try {
      setSaving(true);

      const conditionData = {
        rig_id: selectedRig.id,
        wind_condition: windCondition,
        water_condition: waterCondition,
        settings,
        notes,
        performance_rating: performanceRating
      };

      if (selectedCondition) {
        const { error } = await supabase
          .from('rig_conditions')
          .update(conditionData)
          .eq('id', selectedCondition.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('rig_conditions')
          .insert(conditionData);

        if (error) throw error;
      }

      await loadRigConditions(selectedRig.id);
      onUpdate();
    } catch (error) {
      console.error('Error saving rig condition:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteRigCondition = async () => {
    if (!selectedCondition) return;

    try {
      const { error } = await supabase
        .from('rig_conditions')
        .delete()
        .eq('id', selectedCondition.id);

      if (error) throw error;

      await loadRigConditions(selectedRig!.id);
    } catch (error) {
      console.error('Error deleting rig condition:', error);
    }
  };

  const duplicateRigCondition = async () => {
    if (!selectedRig || !selectedCondition) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('rig_conditions')
        .insert({
          rig_id: selectedRig.id,
          wind_condition: windCondition,
          water_condition: waterCondition === 'flat' ? 'moderate' : waterCondition === 'moderate' ? 'rough' : 'flat',
          settings: selectedCondition.settings,
          notes: selectedCondition.notes
        });

      if (error) throw error;

      await loadRigConditions(selectedRig.id);
    } catch (error) {
      console.error('Error duplicating rig condition:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof RigSettings, value: number | string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (loading) {
    return (
      <div className={`rounded-2xl p-12 text-center ${darkMode ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700' : 'bg-white border border-slate-200'}`}>
        <Settings className={`w-8 h-8 mx-auto mb-4 animate-spin ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading rig settings...</p>
      </div>
    );
  }

  if (rigs.length === 0) {
    return (
      <div className={`rounded-2xl p-12 text-center ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
        <Settings className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
        <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          No Rig Configurations
        </h3>
        <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Create your first rig configuration to start tuning
        </p>
        <button
          onClick={() => setShowNewRigModal(true)}
          className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200"
        >
          <Plus className="w-5 h-5 inline mr-2" />
          Create First Rig
        </button>

        {showNewRigModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewRigModal(false)}>
            <div
              className={`rounded-2xl p-6 max-w-md w-full mx-4 ${darkMode ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700' : 'bg-white border border-slate-200'}`}
              onClick={e => e.stopPropagation()}
            >
              <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Create New Rig
              </h3>
              <input
                type="text"
                value={newRigName}
                onChange={e => setNewRigName(e.target.value)}
                placeholder="e.g., A Rig, B Rig, Light Air Setup"
                className={`w-full px-4 py-3 rounded-lg mb-4 ${
                  darkMode
                    ? 'bg-slate-900 border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewRigModal(false)}
                  className={`flex-1 px-4 py-3 rounded-lg font-medium ${
                    darkMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-900'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={createNewRig}
                  disabled={!newRigName.trim() || saving}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200 disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tuning Guide Banner */}
      {tuningGuideUrl && (
        <a
          href={tuningGuideUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`
            block rounded-2xl p-6 border-2 transition-all group
            ${darkMode
              ? 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/20'
              : 'bg-blue-50 border-blue-200 hover:border-blue-400 hover:bg-blue-100'}
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`
                p-3 rounded-xl
                ${darkMode ? 'bg-blue-500/20' : 'bg-blue-100'}
              `}>
                <FileText className="text-blue-500" size={28} />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Manufacturer Tuning Guide
                </h3>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {tuningGuideFileName || 'Tuning Guide'} • Click to view PDF
                </p>
              </div>
            </div>
            <ExternalLink
              className={`flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-slate-600'} group-hover:text-blue-500`}
              size={20}
            />
          </div>
        </a>
      )}

      {/* Header with Configure Button */}
      <div className="flex items-center justify-between">
        <div>
          {selectedRig && (
            <div>
              <h3 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {selectedRig.name}
              </h3>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {windCondition.charAt(0).toUpperCase() + windCondition.slice(1)} Wind • {waterCondition.charAt(0).toUpperCase() + waterCondition.slice(1)} Water
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            showConfig
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
              : darkMode
              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          <Settings className="w-4 h-4 inline mr-2" />
          {showConfig ? 'Hide Config' : 'Configure'}
        </button>
      </div>

      {/* Collapsible Config Panel */}
      {showConfig && (
        <div className="space-y-6">
          {/* Rig Selector */}
          <div className={`rounded-2xl p-6 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Rig Configuration
              </h3>
              <button
                onClick={() => setShowNewRigModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200 text-sm"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                New Rig
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {rigs.map(rig => (
                <button
                  key={rig.id}
                  onClick={() => setSelectedRig(rig)}
                  className={`p-4 rounded-xl text-left transition-all ${
                    selectedRig?.id === rig.id
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg'
                      : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <div className="font-bold text-sm mb-1">{rig.name}</div>
                  {rig.is_default && (
                    <div className="text-xs opacity-75">Default</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Conditions Selector */}
          <div className={`rounded-2xl p-6 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
        <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Sailing Conditions
        </h3>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Wind Condition */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <Wind className="w-4 h-4 inline mr-2" />
              Wind Condition
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['light', 'medium', 'strong'] as const).map(condition => (
                <button
                  key={condition}
                  onClick={() => setWindCondition(condition)}
                  className={`py-3 rounded-lg font-medium capitalize transition-all ${
                    windCondition === condition
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                      : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {condition}
                </button>
              ))}
            </div>
          </div>

          {/* Water Condition */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <Waves className="w-4 h-4 inline mr-2" />
              Water Condition
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['flat', 'moderate', 'rough'] as const).map(condition => (
                <button
                  key={condition}
                  onClick={() => setWaterCondition(condition)}
                  className={`py-3 rounded-lg font-medium capitalize transition-all ${
                    waterCondition === condition
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                      : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {condition}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedCondition && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={duplicateRigCondition}
              disabled={saving}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                darkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-200 text-slate-900 hover:bg-slate-300'
              }`}
            >
              <Copy className="w-4 h-4 inline mr-2" />
              Duplicate
            </button>
            <button
              onClick={deleteRigCondition}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-all"
            >
              <Trash2 className="w-4 h-4 inline mr-2" />
              Delete
            </button>
          </div>
        )}
      </div>
        </div>
      )}

      {/* Rig Settings */}
      <div className={`rounded-2xl p-6 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
        <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Rig Measurements
        </h3>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MeasurementInput
            label="Static Rake"
            value={settings.staticRake}
            onChange={val => updateSetting('staticRake', val)}
            darkMode={darkMode}
            unit="mm"
          />
          <MeasurementInput
            label="Rake Datum"
            value={settings.rakeDatum}
            onChange={val => updateSetting('rakeDatum', val)}
            darkMode={darkMode}
            unit="mm"
          />
          <MeasurementInput
            label="Shroud Tension"
            value={settings.shroud}
            onChange={val => updateSetting('shroud', val)}
            darkMode={darkMode}
            unit="units"
          />
          <MeasurementInput
            label="Ram Position"
            value={settings.ramPosition}
            onChange={val => updateSetting('ramPosition', val)}
            darkMode={darkMode}
            unit="mm"
          />
          <MeasurementInput
            label="Vang"
            value={settings.vang}
            onChange={val => updateSetting('vang', val)}
            darkMode={darkMode}
            unit="units"
          />
          <MeasurementInput
            label="Mains Outhaul"
            value={settings.mainsOuthaul}
            onChange={val => updateSetting('mainsOuthaul', val)}
            darkMode={darkMode}
            unit="mm"
          />
          <MeasurementInput
            label="Mains Foot Depth"
            value={settings.mainsFootDepth}
            onChange={val => updateSetting('mainsFootDepth', val)}
            darkMode={darkMode}
            unit="mm"
          />
          <MeasurementInput
            label="Mains Twist"
            value={settings.mainsTwist}
            onChange={val => updateSetting('mainsTwist', val)}
            darkMode={darkMode}
            unit="degrees"
          />
          <MeasurementInput
            label="Jib Outhaul"
            value={settings.jibOuthaul}
            onChange={val => updateSetting('jibOuthaul', val)}
            darkMode={darkMode}
            unit="mm"
          />
          <MeasurementInput
            label="Jib Foot Depth"
            value={settings.jibFootDepth}
            onChange={val => updateSetting('jibFootDepth', val)}
            darkMode={darkMode}
            unit="mm"
          />
          <MeasurementInput
            label="Jib Twist"
            value={settings.jibTwist}
            onChange={val => updateSetting('jibTwist', val)}
            darkMode={darkMode}
            unit="degrees"
          />
        </div>

        {/* Performance Rating */}
        <div className="mt-6">
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            <Star className="w-4 h-4 inline mr-2" />
            Performance Rating
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(rating => (
              <button
                key={rating}
                onClick={() => setPerformanceRating(rating)}
                className={`p-3 rounded-lg transition-all ${
                  performanceRating && performanceRating >= rating
                    ? 'text-yellow-500'
                    : darkMode
                    ? 'text-slate-600 hover:text-slate-400'
                    : 'text-slate-300 hover:text-slate-500'
                }`}
              >
                <Star className="w-6 h-6" fill={performanceRating && performanceRating >= rating ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mt-6">
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            placeholder="Add notes about this setup..."
            className={`w-full px-4 py-3 rounded-lg ${
              darkMode
                ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
            } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
          />
        </div>

        {/* Save Button */}
        <div className="mt-6">
          <button
            onClick={saveRigCondition}
            disabled={saving}
            className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200 disabled:opacity-50"
          >
            <Save className="w-5 h-5 inline mr-2" />
            {saving ? 'Saving...' : selectedCondition ? 'Update Settings' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* New Rig Modal */}
      {showNewRigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewRigModal(false)}>
          <div
            className={`rounded-2xl p-6 max-w-md w-full mx-4 ${darkMode ? 'bg-slate-800/80 backdrop-blur-sm border border-slate-700' : 'bg-white border border-slate-200'}`}
            onClick={e => e.stopPropagation()}
          >
            <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Create New Rig
            </h3>
            <input
              type="text"
              value={newRigName}
              onChange={e => setNewRigName(e.target.value)}
              placeholder="e.g., A Rig, B Rig, Light Air Setup"
              className={`w-full px-4 py-3 rounded-lg mb-4 ${
                darkMode
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowNewRigModal(false)}
                className={`flex-1 px-4 py-3 rounded-lg font-medium ${
                  darkMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-900'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={createNewRig}
                disabled={!newRigName.trim() || saving}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface MeasurementInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  darkMode: boolean;
  unit?: string;
}

const MeasurementInput: React.FC<MeasurementInputProps> = ({ label, value, onChange, darkMode, unit }) => {
  return (
    <div>
      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className={`w-full px-4 py-3 rounded-lg pr-16 ${
            darkMode
              ? 'bg-slate-800 border-slate-600 text-white'
              : 'bg-white border-slate-300 text-slate-900'
          } border focus:outline-none focus:ring-2 focus:ring-cyan-500`}
        />
        {unit && (
          <span className={`absolute right-3 top-1/2 transform -translate-y-1/2 text-sm ${
            darkMode ? 'text-slate-500' : 'text-slate-400'
          }`}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};
