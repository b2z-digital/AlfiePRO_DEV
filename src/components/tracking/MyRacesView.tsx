// My races: the tracked races I sailed, where I finished, and a way into each replay.
import type { Kit, SessionRow } from './data';
import { C, Btn } from '../race-simulator/ui';

const ord = (n: number) => `${n}${['st', 'nd', 'rd'][((n + 90) % 100 - 10) % 10 - 1] ?? 'th'}`;

export default function MyRacesView({ sessions, kit, mine, onOpen }: { sessions: SessionRow[]; kit: Kit; mine: string[]; onOpen: (s: SessionRow) => void }) {
  const myTags = new Set(kit.tags.filter(t => t.member_id && mine.includes(t.member_id)).map(t => t.id));
  const done = sessions.filter(s => s.status === 'finished' && s.scoring?.order?.length);
  const rows = done.map(s => {
    const me = s.scoring!.order.find(o => myTags.has(o.tag_id));
    return { s, me, fleet: s.scoring!.order.length };
  }).filter(r => r.me);
  const places = rows.map(r => r.me!.place).filter(p => p > 0);
  const avg = places.length ? places.reduce((a, b) => a + b, 0) / places.length : null;

  if (!myTags.size) {
    return (
      <div className="max-w-[640px] rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-5">
        <h3 className="m-0 text-[16px] font-bold">No tag is linked to you yet</h3>
        <p className="m-0 mt-1.5 text-[13.5px]" style={{ color: C.mute }}>Ask your race officer to put your name on the tag in your boat. Your tracked races, places and replays then collect here.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {[['Tracked races', String(rows.length)], ['Average place', avg != null ? avg.toFixed(1) : '–'], ['Best', places.length ? ord(Math.min(...places)) : '–']].map(([k, v]) => (
          <div key={k} className="min-w-[150px] flex-1 rounded-[18px] border border-white/[0.08] bg-[#0A0F1C] px-4 py-3">
            <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{k}</p><p className="m-0 font-display text-[24px] font-bold">{v}</p>
          </div>
        ))}
      </div>
      <section aria-labelledby="mr-h" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
        <h3 id="mr-h" className="m-0 text-[15px] font-bold">Races</h3>
        {!rows.length && <p className="m-0 mt-2 text-[13px]" style={{ color: C.mute }}>None scored from tracking yet.</p>}
        <ul className="m-0 mt-1 list-none p-0">
          {rows.map(({ s, me, fleet }) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 border-t border-white/[0.05] py-2.5 text-[13.5px]">
              <span className="w-[54px] font-display text-[20px] font-bold">{me!.code ?? ord(me!.place)}</span>
              <span className="min-w-0 flex-1"><b className="block truncate">{s.name}</b><span className="text-[12.5px]" style={{ color: C.mute }}>{new Date(s.gun_at ?? s.created_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {fleet} boats</span></span>
              <Btn small onClick={() => onOpen(s)}>Replay</Btn>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
