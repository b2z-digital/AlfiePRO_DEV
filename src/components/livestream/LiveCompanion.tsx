import { useState } from 'react';
import type { RaceCompanion } from '../../utils/liveRaceCompanion';

/**
 * Race and Standings beside a live picture (board "AlfieTV watch"): the race being
 * sailed, its finishing order as scoring enters it, and the standings so far.
 */
export function LiveCompanion({ companion, loaded, linked }: {
  companion: RaceCompanion | null;
  loaded: boolean;
  /** Whether the broadcast is linked to a race in scoring */
  linked: boolean;
}) {
  const [tab, setTab] = useState<'race' | 'standings'>('race');

  if (!linked || (loaded && !companion)) {
    return (
      <div className="alv-comp">
        <div className="alv-comp-card">
          <p className="alv-comp-empty">
            {linked
              ? 'Live race details aren\'t available for this broadcast.'
              : 'Race details show here when the broadcast is linked to a race in scoring.'}
          </p>
        </div>
      </div>
    );
  }
  if (!companion) {
    return (
      <div className="alv-comp">
        <div className="alv-comp-card"><p className="alv-comp-empty">Loading the race…</p></div>
      </div>
    );
  }

  const c = companion;
  const isRacing = c.status === 'live' || c.status === 'in_progress';
  const statusLine = isRacing
    ? `Racing · ${c.finishers.length} of ${c.total} finished`
    : c.status === 'on_hold'
    ? `On hold${c.statusNotes ? ` · ${c.statusNotes}` : ''}`
    : c.statusLabel
    ? `${c.statusLabel} · ${c.racesDone} ${c.racesDone === 1 ? 'race' : 'races'} sailed`
    : `${c.racesDone} ${c.racesDone === 1 ? 'race' : 'races'} sailed`;
  const firstStill = c.stillRacing[0];

  return (
    <div className="alv-comp">
      <div className="alv-tabs" role="tablist" aria-label="Race details">
        <button type="button" role="tab" aria-selected={tab === 'race'} onClick={() => setTab('race')}>Race</button>
        <button type="button" role="tab" aria-selected={tab === 'standings'} onClick={() => setTab('standings')}>Standings</button>
      </div>

      {tab === 'race' && (
        <>
          <div className={`alv-comp-now ${isRacing ? 'is-racing' : c.status === 'on_hold' ? 'is-hold' : ''}`}>
            <span className="alv-eyebrow">{isRacing ? 'Now' : c.status === 'on_hold' ? 'On hold' : 'Latest'}</span>
            <b className="alv-disp">{c.raceLabel}</b>
            <span>{statusLine}</span>
          </div>

          <div className="alv-comp-card">
            <span className="alv-eyebrow">Finishing order, live from scoring</span>
            {c.finishers.length > 0 ? (
              <ol className="alv-comp-list">
                {c.finishers.map(f => (
                  <li key={f.index}>
                    <span className="p">{f.position}</span>
                    <span className="s">{f.sail}</span>
                    <span className="n">{f.name}</span>
                    <span className="h">{f.hull}</span>
                  </li>
                ))}
                {firstStill && (
                  <li className="is-still">
                    <span className="p">–</span>
                    <span className="s">{firstStill.sail}</span>
                    <span className="n">{firstStill.name}{c.stillRacing.length > 1 ? ` + ${c.stillRacing.length - 1} still racing` : ' still racing'}</span>
                    <span className="h" />
                  </li>
                )}
              </ol>
            ) : (
              <p className="alv-comp-empty">
                {isRacing ? 'No finishers yet. Places show here as scoring enters them.' : 'Places show here once the next race starts.'}
              </p>
            )}
          </div>
        </>
      )}

      {tab === 'standings' && (
        <div className="alv-comp-card">
          <span className="alv-eyebrow">
            Standings after {c.racesDone} {c.racesDone === 1 ? 'race' : 'races'}
          </span>
          {c.standings && c.standings.length > 0 ? (
            <ol className="alv-comp-list">
              {c.standings.map(s => (
                <li key={s.index}>
                  <span className="p">{s.rank}</span>
                  <span className="s">{s.sail}</span>
                  <span className="n">{s.name}</span>
                  <span className="h">{s.net !== null ? `${s.net} pts` : ''}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="alv-comp-empty">
              {c.heatRacing
                ? 'Heat racing standings are on the event\'s Results tab.'
                : 'Standings show here after the first race is scored.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
