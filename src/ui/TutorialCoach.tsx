import { useEffect } from 'react';
import { chapterById } from '../data/tutorials';
import { useGame } from '../store/gameStore';

/** Bottom-centre coach card that walks through a chapter's steps. */
export function TutorialCoach() {
  const tutorial = useGame((s) => s.tutorial);
  const mode = useGame((s) => s.mode);
  const flow = useGame((s) => s.flow);
  const selectedId = useGame((s) => s.selectedId);
  const holdings = useGame((s) => s.portfolio.holdings);
  const speed = useGame((s) => s.speed);
  const day = useGame((s) => s.day);
  const next = useGame((s) => s.tutorialNext);
  const select = useGame((s) => s.select);
  const lookAt = useGame((s) => s.lookAt);
  const def = tutorial ? chapterById(tutorial.chapterId) : undefined;
  const step = def?.steps[tutorial!.step];

  // Point the camera at the building the step is about.
  const stepKey = tutorial ? `${tutorial.chapterId}:${tutorial.step}` : '';
  useEffect(() => {
    if (!tutorial || !step?.highlight?.length) return;
    const id = tutorial.roles[step.highlight[0]]?.[0];
    if (!id || useGame.getState().selectedId === id) return;
    // Slight delay so it wins over the "camera home" issued when a chapter starts.
    const t = setTimeout(() => lookAt(id), 80);
    return () => clearTimeout(t);
  }, [stepKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance when the step's condition is met.
  useEffect(() => {
    if (!tutorial || !step) return;
    const ids = (role: string) => tutorial.roles[role] ?? [];
    const w = step.wait;
    if (w.kind === 'select' && selectedId && ids(w.role).includes(selectedId)) next();
    else if (w.kind === 'buy' && ids(w.role).some((id) => holdings[id])) next();
  }, [tutorial, step, selectedId, holdings, next]);

  if (mode !== 'tutorial' || !tutorial || !def || !step || flow !== 'normal') return null;
  const waitingPlay = step.wait.kind === 'play';
  const w = step.wait;
  const targetIds = w.kind === 'select' || w.kind === 'buy' ? tutorial.roles[w.role] ?? [] : [];
  const needsPick = targetIds.length > 0 && !(selectedId && targetIds.includes(selectedId));
  if (waitingPlay && speed > 0) {
    return (
      <div className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2">
        <div className="card flex items-center gap-3 px-4 py-2 text-sm">
          ⏳ อีก {Math.max(0, tutorial.decisionDay - day)} วันทำการถึงจุดตัดสินใจ
          <button className="btn-primary !py-1.5 text-xs" onClick={skipToDecision}>
            ⏩ ข้ามไปจุดตัดสินใจ
          </button>
        </div>
      </div>
    );
  }

  return (
    // With a company panel open on the right, sit to its left so its trade form and buttons stay usable.
    <div
      className={`pointer-events-auto absolute bottom-6 ${
        selectedId ? 'left-4 w-[min(560px,calc(100%-420px-3rem))] min-w-[300px]' : 'left-1/2 w-[min(560px,calc(100%-32px))] -translate-x-1/2'
      }`}
    >
      <div key={tutorial.step} className="card pop-in border-2 !border-[#ef3b3b] p-4">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted">
          <span className="chip bg-[#fff1c7] text-[#9a6a00]">บทที่ {def.number}</span>
          ขั้นที่ {tutorial.step + 1}/{def.steps.length}
        </div>
        <h3 className="font-display text-base font-semibold">{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed">{step.text}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          {step.wait.kind === 'next' && (
            <button className="btn-primary" onClick={next}>
              ต่อไป →
            </button>
          )}
          {w.kind === 'select' && <span className="mr-auto self-center text-xs text-muted">👉 คลิกตึกที่มีกรอบสีแดง</span>}
          {w.kind === 'buy' && !needsPick && <span className="mr-auto self-center text-xs text-muted">👉 ใส่จำนวนในกล่องที่มีกรอบสีแดงแล้วกดซื้อ</span>}
          {needsPick && (
            <button className="btn-soft" onClick={() => select(targetIds[0], true)}>
              {w.kind === 'buy' ? 'เปิดแผงซื้อขาย' : 'หาไม่เจอ? เลือกให้เลย'}
            </button>
          )}
          {waitingPlay && (
            <button className="btn-primary" onClick={() => useGame.getState().setSpeed(20)}>
              ▶ เล่น (20x)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Jump straight to the chapter decision (the city updates to that day on the way). */
function skipToDecision() {
  for (let i = 0; i < 2000; i++) {
    const s = useGame.getState();
    if (s.phase !== 'playing' || s.flow !== 'normal') break;
    s.advanceDay();
  }
}
