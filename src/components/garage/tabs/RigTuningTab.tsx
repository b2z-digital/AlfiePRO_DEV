import React, { useState, useEffect } from 'react';
import { Settings, Plus, Save, Wind, Waves, Star, Trash2, Copy, FileText, ExternalLink, Pencil, Check, X } from 'lucide-react';
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
  const [tuningGuideUrl, setTuningGuideUrl] = useState<string | null>(null);
  const [tuningGuideFileName, setTuningGuideFileName] = useState<string | null>(null);
  const [editingRigId, setEditingRigId] = useState<string | null>(null);
  const [editingRigName, setEditingRigName] = useState('');
  const [deleteRigConfirm, setDeleteRigConfirm] = useState<string | null>(null);

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
      if (sortedRigs.length > 0 && !selectedRig) {
        setSelectedRig(sortedRigs[0]);
      } else if (sortedRigs.length > 0 && selectedRig) {
        const stillExists = sortedRigs.find(r => r.id === selectedRig.id);
        if (!stillExists) {
          setSelectedRig(sortedRigs[0]);
        }
      } else if (sortedRigs.length === 0) {
        setSelectedRig(null);
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

  const renameRig = async (rigId: string) => {
    if (!editingRigName.trim()) return;

    try {
      const { error } = await supabase
        .from('boat_rigs')
        .update({ name: editingRigName.trim() })
        .eq('id', rigId);

      if (error) throw error;
      await loadRigs();
      if (selectedRig?.id === rigId) {
        setSelectedRig(prev => prev ? { ...prev, name: editingRigName.trim() } : null);
      }
      setEditingRigId(null);
      setEditingRigName('');
    } catch (error) {
      console.error('Error renaming rig:', error);
    }
  };

  const deleteRig = async (rigId: string) => {
    try {
      const { error } = await supabase
        .from('boat_rigs')
        .delete()
        .eq('id', rigId);

      if (error) throw error;
      setDeleteRigConfirm(null);
      await loadRigs();
      onUpdate();
    } catch (error) {
      console.error('Error deleting rig:', error);
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

  const conditionCount = (rigId: string) => {
    if (selectedRig?.id === rigId) return rigConditions.length;
    return null;
  };

  if (loading) {
    return (
      <div className="a-card text-center" style={{ padding: 48 }}>
        <Settings className="w-8 h-8 mx-auto mb-3 animate-spin a-dim" />
        <p className="a-dim text-[13.5px]">Loading rig settings…</p>
      </div>
    );
  }

  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const WINDS = ['light', 'medium', 'strong'] as const;
  const WATERS = ['flat', 'moderate', 'rough'] as const;
  const hasSetup = (w: string, wa: string) => rigConditions.some(rc => rc.wind_condition === w && rc.water_condition === wa);

  return (
    <div className="flex flex-col gap-4">
      {tuningGuideUrl && (
        <a href={tuningGuideUrl} target="_blank" rel="noopener noreferrer" className="a-card flex items-center gap-3.5" style={{ padding: '14px 18px' }}>
          <span className="a-tile" style={{ width: 44, height: 44 }}><FileText size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="a-ink text-[15px] font-semibold">Manufacturer tuning guide</div>
            <div className="a-dim text-[12.5px] mt-0.5 truncate">{tuningGuideFileName || 'Tuning guide'} · PDF</div>
          </div>
          <ExternalLink size={17} className="a-dim" />
        </a>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <span className="a-cap">Rig</span>
        {rigs.length > 0 && (
          <div className="a-seg" style={{ padding: 4 }} role="tablist">
            {rigs.map(rig => {
              const on = selectedRig?.id === rig.id;
              const count = conditionCount(rig.id);
              return (
                <button key={rig.id} onClick={() => setSelectedRig(rig)} className={`a-seg-i a-rig-i ${on ? 'a-seg-on' : ''}`} role="tab" aria-selected={on}>
                  <span className="a-rig-name">{rig.name}</span>
                  <span className="a-rig-sub">{count !== null ? (count > 0 ? `${count} setup${count === 1 ? '' : 's'}` : 'Empty') : rig.is_default ? 'Default' : ' '}</span>
                </button>
              );
            })}
          </div>
        )}
        <button onClick={() => { setNewRigName(''); setShowNewRigModal(true); }} className="a-btn a-btn-q a-txt-b" style={{ height: 38 }}>
          <Plus size={16} />Add rig
        </button>
        <div className="flex-1" />
        {selectedRig && editingRigId === selectedRig.id ? (
          <div className="flex items-center gap-1.5">
            <label className="a-field" style={{ height: 38, width: 200 }}>
              <input
                type="text"
                value={editingRigName}
                onChange={e => setEditingRigName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameRig(selectedRig.id);
                  if (e.key === 'Escape') { setEditingRigId(null); setEditingRigName(''); }
                }}
                autoFocus
                aria-label="Rig name"
              />
            </label>
            <button onClick={() => renameRig(selectedRig.id)} className="a-ib a-txt-g" aria-label="Save name"><Check size={17} /></button>
            <button onClick={() => { setEditingRigId(null); setEditingRigName(''); }} className="a-ib" aria-label="Cancel rename"><X size={17} /></button>
          </div>
        ) : selectedRig && deleteRigConfirm === selectedRig.id ? (
          <div className="flex items-center gap-2">
            <span className="a-txt-r text-[13px] font-medium">Delete “{selectedRig.name}” and all its setups?</span>
            <button onClick={() => setDeleteRigConfirm(null)} className="a-btn" style={{ height: 34, fontSize: 13 }}>Cancel</button>
            <button onClick={() => deleteRig(selectedRig.id)} className="a-btn a-btn-d" style={{ height: 34, fontSize: 13 }}>Delete</button>
          </div>
        ) : selectedRig && (
          <>
            <button onClick={() => { setEditingRigId(selectedRig.id); setEditingRigName(selectedRig.name); }} className="a-ib" aria-label="Rename rig" title="Rename rig"><Pencil size={17} /></button>
            <button onClick={() => setDeleteRigConfirm(selectedRig.id)} className="a-ib a-ib-d" aria-label="Delete rig" title="Delete rig"><Trash2 size={17} /></button>
          </>
        )}
      </div>

      {rigs.length === 0 ? (
        <div className="a-card a-empty text-center" style={{ padding: 40 }}>
          <span className="a-tile mx-auto mb-3" style={{ width: 48, height: 48 }}><Settings size={20} /></span>
          <p className="a-ink text-[15px] font-semibold mb-1">No rigs yet</p>
          <p className="a-dim text-[13px]">Add a rig to start saving setups for each condition</p>
        </div>
      ) : selectedRig && (
        <>
          <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
            <div className="flex items-center gap-3">
              <span className="a-tile a-tile-sm"><Wind size={16} /></span>
              <div className="flex-1 min-w-0">
                <h2 className="a-display a-ink m-0 text-[18px] font-semibold">Conditions</h2>
                <p className="a-dim mt-0.5 text-[12.5px]">{rigConditions.length} setup{rigConditions.length === 1 ? '' : 's'} saved for {selectedRig.name} · tap a cell to load it</p>
              </div>
            </div>
            <div className="grid items-center gap-2" style={{ gridTemplateColumns: '100px repeat(3, 1fr)' }}>
              <span />
              {WATERS.map(wa => <div key={wa} className="a-dim flex items-center justify-center gap-1.5 text-[13px]"><Waves size={14} />{cap(wa)}</div>)}
              {WINDS.map(w => (
                <React.Fragment key={w}>
                  <div className="a-dim flex items-center gap-1.5 text-[13px]"><Wind size={14} />{cap(w)}</div>
                  {WATERS.map(wa => {
                    const on = windCondition === w && waterCondition === wa;
                    const saved = hasSetup(w, wa);
                    return (
                      <button
                        key={wa}
                        onClick={() => { setWindCondition(w); setWaterCondition(wa); }}
                        className={`a-mc ${on ? 'a-mc-on' : saved ? 'a-mc-saved' : 'a-mc-empty'}`}
                        aria-pressed={on}
                        aria-label={`${cap(w)} wind, ${wa} water${saved ? ', saved' : ''}`}
                      >
                        {on ? (saved ? 'Editing' : 'New setup') : saved ? '● Saved' : '+ Add'}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            {selectedCondition && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={duplicateRigCondition} disabled={saving} className="a-btn disabled:opacity-50" style={{ height: 36, fontSize: 13 }}>
                  <Copy size={15} />Copy to another condition
                </button>
                <button onClick={deleteRigCondition} className="a-btn a-btn-q a-txt-r" style={{ height: 36, fontSize: 13 }}>
                  <Trash2 size={15} />Delete this setup
                </button>
              </div>
            )}
          </div>

          <div className="a-card flex flex-col gap-4" style={{ padding: '18px 20px' }}>
            <div className="flex items-center gap-3">
              <span className="a-tile a-tile-sm"><Settings size={16} /></span>
              <div className="flex-1 min-w-0">
                <h2 className="a-display a-ink m-0 text-[18px] font-semibold">{selectedRig.name} · {cap(windCondition)} wind · {cap(waterCondition)} water</h2>
                <p className="a-dim mt-0.5 text-[12.5px]">Rig measurements</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3.5">
              <MeasurementInput label="Static rake" value={settings.staticRake} onChange={val => updateSetting('staticRake', val)} darkMode={darkMode} unit="mm" />
              <MeasurementInput label="Rake datum" value={settings.rakeDatum} onChange={val => updateSetting('rakeDatum', val)} darkMode={darkMode} unit="mm" />
              <MeasurementInput label="Shroud tension" value={settings.shroud} onChange={val => updateSetting('shroud', val)} darkMode={darkMode} unit="units" />
              <MeasurementInput label="Ram position" value={settings.ramPosition} onChange={val => updateSetting('ramPosition', val)} darkMode={darkMode} unit="mm" />
              <MeasurementInput label="Vang" value={settings.vang} onChange={val => updateSetting('vang', val)} darkMode={darkMode} unit="units" />
              <MeasurementInput label="Mains outhaul" value={settings.mainsOuthaul} onChange={val => updateSetting('mainsOuthaul', val)} darkMode={darkMode} unit="mm" />
              <MeasurementInput label="Mains foot depth" value={settings.mainsFootDepth} onChange={val => updateSetting('mainsFootDepth', val)} darkMode={darkMode} unit="mm" />
              <MeasurementInput label="Mains twist" value={settings.mainsTwist} onChange={val => updateSetting('mainsTwist', val)} darkMode={darkMode} unit="°" />
              <MeasurementInput label="Jib outhaul" value={settings.jibOuthaul} onChange={val => updateSetting('jibOuthaul', val)} darkMode={darkMode} unit="mm" />
              <MeasurementInput label="Jib foot depth" value={settings.jibFootDepth} onChange={val => updateSetting('jibFootDepth', val)} darkMode={darkMode} unit="mm" />
              <MeasurementInput label="Jib twist" value={settings.jibTwist} onChange={val => updateSetting('jibTwist', val)} darkMode={darkMode} unit="°" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 items-start">
              <div>
                <span className="a-flab">How it went</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(rating => (
                    <button key={rating} onClick={() => setPerformanceRating(rating)} className={`a-ib ${performanceRating && performanceRating >= rating ? 'a-txt-a' : ''}`} aria-label={`${rating} star${rating === 1 ? '' : 's'}`}>
                      <Star size={20} fill={performanceRating && performanceRating >= rating ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="a-flab">Notes</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add notes about this setup" className="a-inp a-ta w-full" />
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveRigCondition} disabled={saving} className="a-btn a-btn-p disabled:opacity-50" style={{ height: 42 }}>
                <Save size={17} />
                {saving ? 'Saving…' : selectedCondition ? 'Update setup' : 'Save setup'}
              </button>
            </div>
          </div>
        </>
      )}

      {showNewRigModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowNewRigModal(false)}>
          <div
            className="a-sheet max-w-md w-full mx-4" style={{ padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="a-display a-ink text-[20px] font-semibold mb-4">
              New rig
            </h3>
            <input
              type="text"
              value={newRigName}
              onChange={e => setNewRigName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createNewRig(); }}
              placeholder="e.g., A Rig, B Rig, Light Air Setup"
              autoFocus
              className="a-inp w-full mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowNewRigModal(false)}
                className="a-btn flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                onClick={createNewRig}
                disabled={!newRigName.trim() || saving}
                className="a-btn a-btn-p flex-1 justify-center disabled:opacity-50"
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

const MeasurementInput: React.FC<MeasurementInputProps> = ({ label, value, onChange, unit }) => {
  return (
    <div>
      <span className="a-flab">{label}</span>
      <div className="a-ms">
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          aria-label={label}
        />
        {unit && <span className="a-ms-u">{unit}</span>}
        <button type="button" onClick={() => onChange((Number(value) || 0) - 1)} aria-label={`Decrease ${label}`}>−</button>
        <button type="button" onClick={() => onChange((Number(value) || 0) + 1)} aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  );
};
