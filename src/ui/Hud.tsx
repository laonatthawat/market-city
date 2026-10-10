import { useEffect, useState } from 'react';
import { chapterById } from '../data/tutorials';
import { formatAnonDay } from '../engine/anonDate';
import { challengeLabels } from '../engine/challenges';
import { WEATHER_LABEL } from '../engine/weather';
import { baht, pct, signedBaht, toneClass } from '../lib/format';
import { useGame } from '../store/gameStore';
import { PlanEditor } from './PlanEditor';
import { HelpButton, SettingsButton } from './Settings';
import { useTutorialTarget } from './useTutorialTarget';
import type { Speed } from '../store/gameStore';

const SPEEDS: { s: Speed; label: string; tip: string }[] = [
  { s: 1, label: '1x', tip: 'ปกติ: ดูทีละวัน (ปุ่ม 1)' },
  { s: 5, label: '5x', tip: 'เร็ว 5 เท่า (ปุ่ม 2)' },
  { s: 20, label: '20x', tip: 'เร็วมาก 20 เท่า (ปุ่ม 3)' },
];

export function Hud() {
  const view = useGame((s) => s.view)!;
  const run = useGame((s) => s.run)!;
  const day = useGame((s) => s.day);
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const togglePause = useGame((s) => s.togglePause);
  const equity = useGame((s) => s.equity);
  const cash = useGame((s) => s.portfolio.cash);
  const finishRun = useGame((s) => s.finishRun);
  const runInfo = useGame((s) => s.runInfo);
  const mode = useGame((s) => s.mode);
  const flow = useGame((s) => s.flow);
  const tutorial = useGame((s) => s.tutorial);
  const locked = flow !== 'normal';
  const playTarget = useTutorialTarget<HTMLDivElement>('play');

  const last = equity[equity.length - 1];
  // Money put in so far (DCA adds contributions), so returns aren't inflated by deposits.
  const invested = run.startingCash + equity.reduce((a, e) => a + e.contrib, 0);
  const prev = equity[equity.length - 2] ?? last;
  const dailyPnl = last.value - prev.value - last.contrib;
  const progress = (day - run.windowStart) / (run.windowEnd - run.windowStart);
  // Before the first day ticks, nudge newcomers towards the play button (tutorials have their own coach).
  const fresh = speed === 0 && !locked && equity.length <= 1 && mode !== 'tutorial';
  const paused = speed === 0 && !locked && !fresh;

  return (
    <header className="card pointer-events-auto flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
      {/* Phones: drop the title block, weather gauge and day P/L so the city stays visible. */}
      <div className="hidden items-center gap-2.5 sm:flex">
        <div className="grid h-9 w-9 place-items-center rounded-2xl bg-accent text-lg text-white">🏙️</div>
        <div>
          <div className="font-display text-sm font-semibold leading-tight">Market City</div>
          <div className="text-[11px] text-muted">{mode === 'tutorial' && tutorial ? `บทเรียน · ${chapterById(tutorial.chapterId)?.title}` : mode === 'sandbox' ? `Sandbox · seed ${run.seed}` : runInfo?.label}</div>
        </div>
      </div>

      <div className="min-w-[150px] sm:min-w-[180px]" data-tip={`ผ่านไปแล้ว ${Math.round(progress * 100)}% ของรอบนี้`}>
        <div className="font-display text-sm font-semibold">{formatAnonDay(view.dateOf(day), view.windowStartDate)}</div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-soft">
          <div className="h-full rounded-full bg-lilac transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {flow === 'fastforward' ? (
        <div className="chip animate-pulse bg-accent-soft px-3 py-1.5 text-sm text-accent">⏩ กำลังเร่งเวลาไปดูผล…</div>
      ) : (
        <div ref={playTarget.ref} className={`flex items-center gap-1 rounded-2xl bg-soft p-0.5 ${playTarget.className}`} role="group" aria-label="ความเร็วเวลา">
          <button
            className={`tab !flex-none px-3 ${speed === 0 ? 'tab-active !text-accent' : ''} ${fresh ? 'start-pulse' : ''}`}
            onClick={togglePause}
            disabled={locked}
            data-tip={speed === 0 ? 'เริ่มเดินเวลา (Space)' : 'หยุดชั่วคราว (Space)'}
            aria-label={speed === 0 ? 'เล่น' : 'หยุด'}
          >
            {speed === 0 ? '▶' : '⏸'}
          </button>
          {SPEEDS.map(({ s, label, tip }) => (
            <button key={s} className={`tab !flex-none px-3 ${speed === s ? 'tab-active' : ''}`} disabled={locked} onClick={() => setSpeed(s)} data-tip={tip}>
              {label}
            </button>
          ))}
        </div>
      )}
      {fresh && <span className="chip pop-in bg-accent-soft text-accent">👈 กด ▶ หรือ Space เพื่อให้เวลาเดิน</span>}
      {paused && <span className="chip bg-soft text-muted">⏸ หยุดอยู่</span>}

      <div className="hidden sm:contents">
        <Sentiment />
      </div>
      <RunExtras />

      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 sm:gap-x-5">
        <Metric label="เงินสด" value={baht(cash)} tip="เงินที่ยังไม่ได้ลงทุน ใช้ซื้อหุ้นได้ทันที" />
        <Metric
          label="มูลค่าพอร์ต"
          value={baht(last.value)}
          sub={pct(invested > 0 ? last.value / invested - 1 : 0)}
          tone={last.value - invested}
          tip="เงินสด + มูลค่าหุ้นทั้งหมดตามราคาปิดวันนี้ (วงเล็บ = กำไร/ขาดทุนเทียบเงินที่ลงไป)"
        />
        <div className="hidden sm:block">
          <Metric label="กำไร/ขาดทุนวันนี้" value={signedBaht(dailyPnl)} tone={dailyPnl} tip="มูลค่าพอร์ตเปลี่ยนไปเท่าไรจากวันก่อน" />
        </div>
        <div className="flex gap-1.5">
          <HelpButton />
          <SettingsButton />
          <FinishButton onConfirm={finishRun} label={mode === 'tutorial' ? 'ออกจากบทเรียน' : 'จบรอบ'} />
        </div>
      </div>
    </header>
  );
}

/** Two-step button: first click arms it, second click within 3 s confirms. */
function FinishButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={`${armed ? 'btn-down' : 'btn-soft'} whitespace-nowrap !py-1.5 text-xs`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? `ยืนยัน${label}?` : label}
    </button>
  );
}

function Metric({ label, value, sub, tone, tip }: { label: string; value: string; sub?: string; tone?: number; tip?: string }) {
  return (
    <div className="cursor-help text-right" data-tip={tip} data-tip-end="">
      <div className="stat-label">{label}</div>
      <div className={`whitespace-nowrap text-sm font-semibold ${tone !== undefined ? toneClass(tone) : ''}`}>
        {value} {sub && <span className="text-xs">({sub})</span>}
      </div>
    </div>
  );
}

/** Weather = market sentiment, plus a fear/greed gauge. */
function Sentiment() {
  const weather = useGame((s) => s.weather);
  const score = useGame((s) => s.weatherScore);
  const t = useTutorialTarget<HTMLDivElement>('weather');
  const w = WEATHER_LABEL[weather];
  return (
    <div ref={t.ref} className={`flex cursor-help items-center gap-2 p-1 ${t.className}`} data-tip={`${w.hint} · เข็มบอกอารมณ์ตลาด: ซ้าย = กลัว ขวา = โลภ`}>
      <span className="text-xl">{w.icon}</span>
      <div>
        <div className="stat-label whitespace-nowrap">อากาศในเมือง · {w.th}</div>
        <div className="flex items-center gap-1.5">
          <div className="relative h-1.5 w-20 rounded-full" style={{ background: 'linear-gradient(90deg, var(--down), #f2c94c, var(--up))' }}>
            <div className="absolute -top-0.5 h-2.5 w-1.5 rounded-full bg-ink" style={{ left: `calc(${score}% - 3px)` }} />
          </div>
          <span className="text-[11px] text-muted">{score < 25 ? 'กลัว' : score > 75 ? 'โลภ' : 'ปกติ'}</span>
        </div>
      </div>
    </div>
  );
}

/** DCA status + plan editor button, and active challenge chips. */
function RunExtras() {
  const dca = useGame((s) => s.dca);
  const run = useGame((s) => s.run);
  const equity = useGame((s) => s.equity);
  const [planOpen, setPlanOpen] = useState(false);
  if (!run) return null;
  const challenges = challengeLabels(run.modifiers);
  const contributed = run.startingCash + equity.reduce((a, e) => a + e.contrib, 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {dca && (
        <>
          <span className="chip bg-soft" title="เงินที่ลงไปทั้งหมด">
            💰 ลงไปแล้ว {baht(contributed)} · เดือนละ {baht(dca.monthly)}
          </span>
          <button className="chip bg-accent-soft text-accent" onClick={() => setPlanOpen(true)}>
            📋 แผนลงทุนอัตโนมัติ{dca.auto ? ' (เปิด)' : ''}
          </button>
          {planOpen && <PlanEditor onClose={() => setPlanOpen(false)} />}
        </>
      )}
      {challenges.map((c) => (
        <span key={c} className="chip bg-[#fff1c7] text-[#9a6a00]">
          🛡️ {c}
        </span>
      ))}
    </div>
  );
}
