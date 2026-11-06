import React from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Minimize2, RotateCcw, Settings, Timer, Trophy } from 'lucide-react';
import { AlfieIcon } from '../brand/AlfieIcon';
import type { RaceEvent } from '../../types/race';

/**
 * Alfie theme: the single scoring top bar (board "SC_pro").
 * Back · event title/meta · race stepper · mode switch · StartBox ·
 * Overall results · checkpoints / settings / full screen · Complete scoring.
 * Purely presentational: every action is a callback the scoring screen already had.
 */

type Mode = 'pro' | 'touch' | 'spreadsheet';

const ClassFlag = () => (
  <svg width="9" height="11" viewBox="0 0 10 12" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M1 .75v10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M1.75 1.25h6.5L1.75 5.5z" fill="currentColor" />
  </svg>
);

export const ScoringTopBar: React.FC<{
  event: RaceEvent | null;
  raceType: 'handicap' | 'scratch';
  mode: Mode;
  modes: Mode[];
  onModeChange: (m: Mode) => void;
  currentRace: number;
  numRaces: number;
  completedRaces: number;
  onPrevRace?: () => void;
  onNextRace?: () => void;
  onBack: () => void;
  onStartBox?: () => void;
  onOverallResults?: () => void;
  onCheckpoints: () => void;
  onSettings: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  completeLabel?: string | null;
  onComplete?: () => void;
  trailing?: React.ReactNode;
}> = ({
  event, raceType, mode, modes, onModeChange, currentRace, numRaces, completedRaces, onPrevRace, onNextRace,
  onBack, onStartBox, onOverallResults, onCheckpoints, onSettings, fullscreen, onToggleFullscreen,
  completeLabel, onComplete, trailing,
}) => {
  const date = event?.date ? new Date(event.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const meta = [raceType === 'handicap' ? 'Handicap' : 'Scratch', (event as any)?.clubAbbreviation || event?.venue, date].filter(Boolean);
  const race = Math.min(Math.max(currentRace, 1), Math.max(numRaces, 1));

  return (
    <div className="a-sbar" role="toolbar" aria-label="Scoring">
      <button type="button" className="a-ib" style={{ width: 38, height: 38 }} onClick={onBack} aria-label="Back to Race Management" title="Back to Race Management">
        <ArrowLeft size={19} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="a-display a-ink text-lg font-bold truncate">{event?.eventName || event?.clubName || 'Scoring'}</div>
        <div className="a-dim flex items-center gap-2.5 text-xs mt-[3px] min-w-0 overflow-hidden whitespace-nowrap">
          {event?.raceClass && <span className="a-lb-cls" style={{ height: 20, fontSize: 10.5 }}><ClassFlag />{event.raceClass}</span>}
          {meta.map((m, i) => (
            <React.Fragment key={i}>{i > 0 && <span aria-hidden="true">·</span>}<span>{m}</span></React.Fragment>
          ))}
        </div>
      </div>

      {numRaces > 0 && (
        <div className="a-stepper" aria-label={`Race ${race} of ${numRaces}`}>
          <button type="button" className="a-ib" onClick={onPrevRace} disabled={!onPrevRace || race <= 1} aria-label="Previous race"><ChevronLeft size={18} /></button>
          <div className="px-2.5 text-center">
            <div className="a-display a-ink text-[17px] font-bold leading-none">Race {race}<span className="a-dim" style={{ font: "500 12px 'Instrument Sans', sans-serif" }}> of {numRaces}</span></div>
            <div className="a-dots mt-[5px]" aria-hidden="true">
              {Array.from({ length: Math.min(numRaces, 20) }, (_, i) => (
                <i key={i} className={i + 1 === race ? 'a' : i < completedRaces ? 'd' : ''} />
              ))}
            </div>
          </div>
          <button type="button" className="a-ib" onClick={onNextRace} disabled={!onNextRace || race >= numRaces} aria-label="Next race"><ChevronRight size={18} /></button>
        </div>
      )}

      <div className="flex flex-wrap justify-end items-center gap-2 ml-auto">
        {modes.length > 1 && (
          <div className="a-seg" role="radiogroup" aria-label="Scoring mode">
            {modes.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={m === mode} onClick={() => m !== mode && onModeChange(m)} className={`a-seg-i ${m === mode ? 'a-seg-on' : ''}`} aria-label={`${m === 'pro' ? 'Pro' : m === 'touch' ? 'Touch' : 'Spreadsheet'} mode`}>
                <AlfieIcon glyph={m === 'pro' ? 'table' : m === 'touch' ? 'hand' : 'sheet'} size={17} />
                {m === 'pro' ? 'Pro' : m === 'touch' ? 'Touch' : 'Spreadsheet'}
              </button>
            ))}
          </div>
        )}
        {(onStartBox || onOverallResults) && <span className="a-vd" />}
        {onStartBox && <button type="button" className="a-btn a-btn-sb" style={{ height: 40 }} onClick={onStartBox}><Timer size={17} />StartBox</button>}
        {onOverallResults && <button type="button" className="a-btn a-btn-gold" style={{ height: 40 }} onClick={onOverallResults}><Trophy size={17} />Overall results</button>}
        <span className="a-vd" />
        <button type="button" className="a-ib" onClick={onCheckpoints} aria-label="Checkpoints" title="Checkpoints & rollback"><RotateCcw size={18} /></button>
        <button type="button" className="a-ib" onClick={onSettings} aria-label="Race settings" title="Settings"><Settings size={18} /></button>
        <button type="button" className="a-ib a-ib-on" onClick={onToggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title={fullscreen ? 'Exit full screen' : 'Full screen'}>
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        {trailing}
        {completeLabel && onComplete && (
          <button type="button" className="a-btn a-btn-g" style={{ height: 40 }} onClick={onComplete} title={completeLabel}><Trophy size={17} />{completeLabel.replace(/ scoring$/, '')}</button>
        )}
      </div>
    </div>
  );
};
