import { CHAPTERS, chapterById } from '../data/tutorials';
import { DECOS } from '../data/unlocks';
import { pct, thaiDate, toneClass } from '../lib/format';
import { useGame } from '../store/gameStore';
import { CivicUnlocked } from './CivicUnlock';

/** End-of-chapter card: takeaways plus the reveal of real names and dates. */
export function ChapterComplete() {
  const tutorial = useGame((s) => s.tutorial);
  const view = useGame((s) => s.view);
  const run = useGame((s) => s.run);
  const dataset = useGame((s) => s.dataset);
  const decisions = useGame((s) => s.decisions);
  const backToMenu = useGame((s) => s.backToMenu);
  const startChapter = useGame((s) => s.startChapter);
  const def = tutorial ? chapterById(tutorial.chapterId) : undefined;
  if (!def || !view || !run) return null;
  const nextDef = CHAPTERS.find((c) => c.number === def.number + 1);
  const d = decisions[decisions.length - 1];

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center overflow-y-auto bg-black/10 p-4">
      <div className="card pop-in w-full max-w-xl p-6">
        <div className="text-4xl">🎓</div>
        <div className="stat-label mt-1">จบบทที่ {def.number}</div>
        <h1 className="font-display text-2xl font-semibold">{def.title}</h1>

        <ul className="mt-3 space-y-1.5 text-sm">
          {def.takeaways.map((t) => (
            <li key={t} className="flex gap-2">
              <span className="text-up">✓</span>
              {t}
            </li>
          ))}
        </ul>

        {d && (
          <p className="mt-3 rounded-2xl bg-soft p-3 text-sm">
            คุณเลือก "{d.chosenLabel}" ได้ผล <b className={toneClass(d.chosenReturn)}>{pct(d.chosenReturn, 1)}</b>
            {d.bestLabel !== d.chosenLabel && (
              <>
                {' '}· ทางเลือกที่ดีที่สุดในครั้งนี้คือ "{d.bestLabel}" ({pct(d.bestReturn, 1)})
              </>
            )}
          </p>
        )}

        <CivicUnlocked defs={DECOS.filter((c) => c.requires.chapter === def.id)} />

        <section className="mt-3">
          <h2 className="stat-label mb-1">เฉลยบริษัทและช่วงเวลา</h2>
          <p className="mb-1.5 text-xs text-muted">
            {dataset?.real ? `${thaiDate(view.windowStartDate)} – ${thaiDate(view.windowEndDate)}` : 'ตลาดจำลอง (บริษัทสมมติ)'}
          </p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {view.companies.map((c) => (
              <span key={c.id} className="chip bg-soft">
                {run.disguisedNames[c.id]} → <b>{c.realName}</b>
              </span>
            ))}
          </div>
        </section>

        <div className="mt-5 flex gap-2">
          <button className="btn-soft flex-1" onClick={backToMenu}>
            กลับเมนู
          </button>
          {nextDef && (
            <button className="btn-primary flex-1" onClick={() => startChapter(nextDef.id)}>
              บทที่ {nextDef.number} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
