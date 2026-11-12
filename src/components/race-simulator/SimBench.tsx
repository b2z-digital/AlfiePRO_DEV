// The scoring bench, for race officers: one invented fleet sailed as a whole regatta under each
// scoring system AlfiePRO runs, side by side, and over many regattas, how well each one puts the
// best sailors at the top. Every system is run by AlfiePRO's own code, as Race Management runs it.
// The results can be taken away as files Race Management's event simulation reads. Nothing here is
// written to any club's events or results.
import { useMemo, useState } from 'react';
import { Download, Shuffle } from 'lucide-react';
import { MIX_NAME, SYSTEM_NAME, exportRows, fleetFor, measure, runSystem, toCsv, type BenchSetup, type Mix, type Outcome, type Score, type System } from './bench';
import { FLEET_NAME } from './heats';
import { Brand, DoorBack } from './SimDoors';
import SimHero from './SimHero';
import type { Setup } from './SimHome';
import { C, Cap, cx } from './ui';

const DISPLAY = "'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif";
const SYSTEMS: System[] = ['low', 'hms', 'shrs'];
const FLEETS = [12, 16, 24, 32, 40, 48, 60];
const RACES = [6, 8, 12, 16, 24];
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Choice<T extends string | number>({ label, value, options, onPick, name }: { label: string; value: T; options: T[]; onPick: (v: T) => void; name?: (v: T) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <Cap>{label}</Cap>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map(o => (
          <button key={String(o)} type="button" className="sim-chip-btn" aria-pressed={value === o} onClick={() => onPick(o)}
            style={value === o ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>{name ? name(o) : String(o)}</button>
        ))}
      </div>
    </div>
  );
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One system's result: the order it ranked the fleet in, against how good each boat really is. */
function Column({ out, fleet, truth, onExport }: { out: Outcome; fleet: ReturnType<typeof fleetFor>; truth: Map<number, number>; onExport: () => void }) {
  return (
    <section className="sim-card flex min-w-0 flex-col gap-3 p-4 sm:p-5" aria-label={SYSTEM_NAME[out.system]}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="sim-h3">{SYSTEM_NAME[out.system]}</h3>
          <p className="m-0 mt-0.5 text-[12.5px] leading-snug" style={{ color: C.mute }}>
            {!out.ran ? out.why : out.system === 'low' ? `All ${fleet.length} boats in every race.` : out.system === 'hms' ? `${out.heats} heats, ${out.promotion} promoted from each heat to the one above.` : `${out.heats} heats: ${out.qualifying} rounds of qualifying, then finals in ${['A', 'B', 'C', 'D', 'E'].slice(0, out.heats).map(h => FLEET_NAME[h as 'A'] ?? h).join(', ')} fleets.`}
          </p>
        </div>
        {out.ran && <button type="button" className="sim-chip-btn" onClick={onExport} title="Download the results"><Download size={15} aria-hidden="true" />{out.system === 'shrs' ? '.xlsx' : '.csv'}</button>}
      </div>
      {out.ran && (
        <table className="w-full border-collapse text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-[0.1em]" style={{ color: C.faint }}><th className="w-8 py-1.5 font-semibold">#</th><th className="py-1.5 font-semibold">Skipper</th><th className="py-1.5 text-right font-semibold" title="Where the boat would be if the order were her true strength">True</th><th className="py-1.5 pl-2 text-right font-semibold">Net</th></tr></thead>
          <tbody>
            {out.rows.slice(0, 16).map(r => {
              const t = truth.get(r.index)!, off = Math.abs(t - r.rank);
              return (
                <tr key={r.index} className="border-t border-white/[0.06]">
                  <td className="py-1.5 font-semibold tabular-nums">{r.rank}</td>
                  <td className="max-w-[170px] truncate py-1.5">{fleet[r.index].name} <span className="text-[11px]" style={{ color: C.faint }}>{fleet[r.index].level}</span></td>
                  <td className={cx('py-1.5 text-right tabular-nums', off >= 5 && 'font-bold')} style={{ color: off >= 5 ? '#FFB86B' : C.mute }}>{t}</td>
                  <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{Number.isInteger(r.net) ? r.net : r.net.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {out.ran && out.rows.length > 16 && <p className="m-0 text-[12px]" style={{ color: C.faint }}>The top 16 of {out.rows.length}. The download has everyone, race by race.</p>}
    </section>
  );
}

export default function SimBench({ setup, onBack }: { setup: Setup; onBack: () => void }) {
  const [b, setB] = useState<BenchSetup>({ fleet: 32, races: 12, mix: 'mixed', letters: true, seed: 1 });
  const [runs, setRuns] = useState<number>(0);
  const [scores, setScores] = useState<(Score | null)[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fleet = useMemo(() => fleetFor(b), [b]);
  const outs = useMemo(() => (runs ? SYSTEMS.map(s => runSystem(s, b, fleet)) : null), [runs, b, fleet]);
  const truth = useMemo(() => new Map(fleet.map((_, i) => i).sort((a, z) => fleet[z].strength - fleet[a].strength).map((idx, k) => [idx, k + 1])), [fleet]);
  const change = (p: Partial<BenchSetup>) => { setB(x => ({ ...x, ...p })); setScores(null); };
  const exportOne = async (out: Outcome) => {
    const rows = exportRows(out, fleet);
    const name = `alfiepro-bench-${out.system}-${b.fleet}-boats-${b.races}-races`;
    if (out.system === 'shrs') {
      // (Race Management's SHRS import reads the first sheet of a workbook, laid out as its template.)
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'AllScores');
      const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      download(`${name}.xlsx`, new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    } else download(`${name}.csv`, new Blob([toCsv(rows)], { type: 'text/csv' }));
  };
  const runMeasure = () => {
    setBusy(true); setScores(null);
    // (A beat for the page to say it's busy before the work starts.)
    setTimeout(() => { setScores(SYSTEMS.map(s => measure(s, b, 25))); setBusy(false); }, 30);
  };
  const best = scores ? Math.max(...scores.map(s => s?.rho ?? -1)) : null;

  return (
    <div className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <section className="sim-home-hero">
        <div className="sim-home-media" aria-hidden="true"><SimHero setup={{ ...setup, fleetSize: 16 }} fill /><div className="sim-home-scrim" /></div>
        <div className="sim-home-hero-body px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="flex flex-wrap items-center gap-3"><DoorBack onHome={onBack} /><Brand /></div>
          <h1 className="sim-home-title">Scoring bench</h1>
          <p className="sim-home-sub">For race officers: one fleet sailed as a whole regatta under low point, HMS and SHRS, each run by AlfiePRO's own scoring, side by side.</p>
        </div>
      </section>

      <div className="sim-home-body flex flex-col gap-6 px-4 pb-16 sm:px-6 lg:px-10 xl:px-16">
        <section className="sim-glass flex flex-col gap-5 p-5 sm:p-7" aria-labelledby="bench-set">
          <h2 id="bench-set" className="sr-only">The regatta</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            <Choice label="Boats" value={b.fleet} options={FLEETS} onPick={v => change({ fleet: v })} />
            <Choice label="Races" value={b.races} options={RACES} onPick={v => change({ races: v })} />
            <Choice label="The fleet" value={b.mix} options={['mixed', 'close', 'stars'] as Mix[]} onPick={v => change({ mix: v })} name={v => MIX_NAME[v]} />
            <Choice label="Letter scores" value={b.letters ? 'on' : 'off'} options={['on', 'off']} onPick={v => change({ letters: v === 'on' })} name={v => (v === 'on' ? 'The odd OCS, DNF and DSQ' : 'None')} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="sim-btn-lg sim-btn-go" onClick={() => setRuns(n => n + 1)}>{runs ? 'Run it again' : 'Run the regatta'}</button>
            <button type="button" className="sim-btn-lg" onClick={() => { change({ seed: b.seed + 1 }); setRuns(n => n + (runs ? 1 : 0)); }}><Shuffle size={16} aria-hidden="true" />A new fleet</button>
            <span className="text-[12.5px]" style={{ color: C.faint }}>Each boat has a true strength the systems can't see; each race finishes by strength, with luck.</span>
          </div>
        </section>

        {outs && (
          <div className="grid items-start gap-5 xl:grid-cols-3">
            {outs.map(o => <Column key={o.system} out={o} fleet={fleet} truth={truth} onExport={() => void exportOne(o)} />)}
          </div>
        )}
        {outs && <p className="m-0 -mt-2 text-[12.5px] leading-snug" style={{ color: C.faint }}>"True" is where each boat would finish if the order were her real strength. Orange: five or more places out. The .xlsx (SHRS) opens in Race Management's event simulation as an SHRS file; the .csv (low point, HMS) pastes in as scores.</p>}

        <section className="sim-card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="bench-measure">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[240px] flex-1">
              <h2 id="bench-measure" className="sim-h3">Which system finds the best sailors?</h2>
              <p className="m-0 mt-1 text-[13px] leading-snug" style={{ color: C.mute }}>25 regattas of this set-up, each with a new fleet and new races, under each system.</p>
            </div>
            <button type="button" className="sim-btn-lg" disabled={busy} onClick={runMeasure}>{busy ? 'Sailing 75 regattas…' : 'Run 25 regattas each'}</button>
          </div>
          {scores && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13.5px]">
                <thead><tr className="text-left text-[11.5px] uppercase tracking-[0.08em]" style={{ color: C.faint }}>
                  <th className="py-2 pr-3 font-semibold">System</th><th className="py-2 pr-3 text-right font-semibold">Order right</th><th className="py-2 pr-3 text-right font-semibold">Best sailor wins</th><th className="py-2 pr-3 text-right font-semibold">Best sailor's place</th><th className="py-2 text-right font-semibold">True top ten in the top ten</th>
                </tr></thead>
                <tbody>
                  {SYSTEMS.map((s, k) => {
                    const m = scores[k];
                    return (
                      <tr key={s} className="border-t border-white/[0.06]">
                        <td className="py-2 pr-3 font-semibold">{SYSTEM_NAME[s]}</td>
                        {m ? (<>
                          <td className="py-2 pr-3 text-right tabular-nums" style={{ color: m.rho === best ? '#7EE2A8' : undefined, fontWeight: m.rho === best ? 700 : 400 }}>{m.rho.toFixed(2)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{pct(m.bestWins)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{m.bestRank.toFixed(1)}</td>
                          <td className="py-2 text-right tabular-nums">{pct(m.topTenRight)}</td>
                        </>) : <td colSpan={4} className="py-2 text-right" style={{ color: C.faint }}>Not for {b.fleet} boats</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="m-0 mt-3 text-[12.5px] leading-snug" style={{ color: C.faint }}>"Order right" is how close the final order is to the true one (Spearman's rank correlation: 1 is exact). It is a model: luck is the same in every race and every heat, and nobody sails better for being in a better heat.</p>
            </div>
          )}
        </section>
        <p className="m-0 text-[12.5px]" style={{ color: C.faint, fontFamily: DISPLAY }}>The skippers are invented. Nothing here is written to any club's events or results.</p>
      </div>
    </div>
  );
}
