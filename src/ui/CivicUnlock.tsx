import { useState } from 'react';
import { DECOS, meets } from '../data/unlocks';
import type { DecoDef } from '../data/unlocks';
import { useGame } from '../store/gameStore';

/** "New building in the city" card shown after a chapter or run that unlocked civic buildings. */
export function CivicUnlocked({ defs }: { defs: DecoDef[] }) {
  if (defs.length === 0) return null;
  return (
    <section className="mt-3">
      <h2 className="mb-1 text-sm font-semibold">🏗️ อาคารใหม่ในเมือง</h2>
      <div className="flex flex-wrap gap-2">
        {defs.map((d) => (
          <div key={d.kind} className="pop-in flex items-center gap-2 rounded-2xl bg-accent-soft px-3 py-2 text-sm">
            <span className="text-2xl">{d.icon}</span>
            <div>
              <div className="font-semibold">{d.name}</div>
              <div className="text-xs text-muted">{d.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** All civic buildings with their lock state (menu stats tab). */
export function CivicList() {
  const chapters = useGame((s) => s.progress.chapters);
  const achievements = useGame((s) => s.achievements);
  const runs = useGame((s) => s.history.length);
  const [open, setOpen] = useState<string | null>(null);
  const progress = { chapters, achievements, runsPlayed: runs };
  const count = DECOS.filter((d) => meets(d.requires, progress)).length;
  const d = DECOS.find((x) => x.kind === open);
  const have = d ? meets(d.requires, progress) : false;
  return (
    <section>
      <h2 className="stat-label mb-1.5">
        อาคารพิเศษในเมือง ({count}/{DECOS.length}) · กดดูวิธีได้
      </h2>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {DECOS.map((x) => {
          const ok = meets(x.requires, progress);
          return (
            <button
              key={x.kind}
              onClick={() => setOpen(open === x.kind ? null : x.kind)}
              className={`flex items-center gap-2 rounded-2xl border-2 p-2 text-left transition hover:brightness-95 ${open === x.kind ? 'border-accent' : 'border-transparent'} ${
                ok ? 'bg-accent-soft' : 'bg-soft'
              }`}
            >
              <span className={`text-2xl ${ok ? '' : 'opacity-50'}`}>{ok ? x.icon : '🔒'}</span>
              <div className={`min-w-0 ${ok ? '' : 'opacity-60'}`}>
                <div className="truncate text-[11px] font-semibold">{x.name}</div>
                <div className="truncate text-[10px] text-muted">{ok ? x.desc : x.requiresText}</div>
              </div>
            </button>
          );
        })}
      </div>
      {d && (
        <div className="pop-in mt-2 rounded-2xl border border-line bg-card-solid p-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{d.icon}</span>
            <div className="min-w-0 flex-1 font-semibold">{d.name}</div>
            <span className={`chip shrink-0 ${have ? 'bg-up/15 text-up' : 'bg-soft text-muted'}`}>{have ? '✓ อยู่ในเมืองแล้ว' : '🔒 ยังไม่ปลดล็อก'}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">
            <b>วิธีปลดล็อก:</b> {d.requiresText}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{d.meaning}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{d.effect}</p>
        </div>
      )}
    </section>
  );
}
