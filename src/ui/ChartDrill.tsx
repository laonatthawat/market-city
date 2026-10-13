import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Indicator } from '../data/chartLessons';
import { loadLessonBars, loadManifest } from '../engine/lessonData';
import { pct, thaiDate, toneClass } from '../lib/format';
import { loadJson, saveJson } from '../lib/storage';
import { DrawingToolbar } from './ChartDrawings';
import type { Drawing, Tool } from './ChartDrawings';
import { HistoryChart, IND_STYLE } from './HistoryChart';

/**
 * "Guess the chart": six months of a random real stock with dates and name hidden. Read it (draw
 * on it if you like), guess whether the price is higher or lower 20 trading days later, then see
 * what really happened.
 */

const WINDOW = 126;
const AHEAD = 20;
const STATS_KEY = 'mc.chartDrill';
const IND_KEY = 'mc.drillIndicators';
const INDICATORS: Indicator[] = ['ema20', 'ma50', 'ma200', 'rsi', 'volume'];

interface Round {
  ticker: string;
  name: string;
  from: string;
  to: string;
  end: string;
  /** Close on the decision day and AHEAD days later. */
  now: number;
  later: number;
}
interface Stats {
  played: number;
  correct: number;
  streak: number;
  best: number;
}

async function newRound(): Promise<Round> {
  const m = await loadManifest();
  for (let tries = 0; tries < 20; tries++) {
    const c = m.companies[Math.floor(Math.random() * m.companies.length)];
    const bars = await loadLessonBars(c.id);
    // Leave room for warmed-up MA200 on the left and the answer on the right.
    const lo = 200 + WINDOW;
    const hi = bars.length - 1 - AHEAD;
    if (hi <= lo) continue;
    const i = lo + Math.floor(Math.random() * (hi - lo));
    return { ticker: c.id, name: c.name, from: bars[i - WINDOW + 1].date, to: bars[i].date, end: bars[i + AHEAD].date, now: bars[i].close, later: bars[i + AHEAD].close };
  }
  throw new Error('no data');
}

export function ChartDrill({ onClose }: { onClose: () => void }) {
  const [round, setRound] = useState<Round | null>(null);
  const [failed, setFailed] = useState(false);
  const [guess, setGuess] = useState<'up' | 'down' | null>(null);
  const [stats, setStats] = useState<Stats>(() => loadJson<Stats>(STATS_KEY, { played: 0, correct: 0, streak: 0, best: 0 }));
  const [ind, setInd] = useState<Indicator[]>(() => loadJson<Indicator[]>(IND_KEY, ['ma50', 'volume']));
  const [tool, setTool] = useState<Tool>('pan');
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  const next = () => {
    setRound(null);
    setGuess(null);
    setDrawings([]);
    setTool('pan');
    setFailed(false);
    newRound().then(setRound, () => setFailed(true));
  };
  useEffect(next, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (k: Indicator) => {
    const nextInd = ind.includes(k) ? ind.filter((x) => x !== k) : [...ind, k];
    setInd(nextInd);
    saveJson(IND_KEY, nextInd);
  };

  const answer = (g: 'up' | 'down') => {
    if (!round || guess) return;
    setGuess(g);
    setTool('pan');
    const ok = (round.later >= round.now) === (g === 'up');
    const s = { played: stats.played + 1, correct: stats.correct + (ok ? 1 : 0), streak: ok ? stats.streak + 1 : 0, best: Math.max(stats.best, ok ? stats.streak + 1 : 0) };
    setStats(s);
    saveJson(STATS_KEY, s);
  };

  const change = round ? round.later / round.now - 1 : 0;
  const ok = round && guess ? (change >= 0) === (guess === 'up') : false;

  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-3 backdrop-blur-[2px] sm:p-4">
      <div className="card pop-in w-full max-w-3xl !bg-card-solid p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-accent text-lg text-white">🎯</div>
          <div className="min-w-0 flex-1">
            <div className="stat-label">แบบฝึกทายกราฟ</div>
            <div className="truncate font-semibold">{guess && round ? `${round.ticker} · ${round.name}` : 'หุ้นปริศนา'}</div>
          </div>
          <div className="hidden text-right text-xs text-muted sm:block">
            ทายถูก {stats.correct}/{stats.played}
            {stats.played > 0 && ` (${Math.round((stats.correct / stats.played) * 100)}%)`}
            <br />
            ถูกติดกัน {stats.streak} · สูงสุด {stats.best}
          </div>
          <button className="btn-soft !h-9 !w-9 !p-0" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          {INDICATORS.map((k) => (
            <button
              key={k}
              onClick={() => toggle(k)}
              className={`h-7 rounded-xl border px-2 text-xs font-semibold transition ${ind.includes(k) ? 'border-transparent text-white' : 'border-line bg-soft/40 text-muted hover:text-ink'}`}
              style={ind.includes(k) ? { background: IND_STYLE[k].color } : undefined}
            >
              {IND_STYLE[k].label}
            </button>
          ))}
        </div>
        {!guess && (
          <div className="mb-2">
            <DrawingToolbar tool={tool} setTool={setTool} onClear={() => setDrawings([])} count={drawings.length} />
          </div>
        )}

        {failed ? (
          <p className="rounded-2xl bg-soft p-6 text-center text-sm text-muted">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</p>
        ) : round ? (
          <HistoryChart
            spec={{
              ticker: round.ticker,
              from: round.from,
              to: guess ? round.end : round.to,
              indicators: ind,
              annotations: guess ? [{ kind: 'mark', date: round.to, text: 'ทายตรงนี้', tone: 'info', pos: 'above' }] : [],
            }}
            hideDates={!guess}
            lines={guess ? [{ price: round.now, tone: 'info', label: 'ราคาตอนทาย' }] : []}
            tool={tool}
            drawings={drawings}
            onDrawings={setDrawings}
            className={ind.includes('rsi') ? 'h-80 sm:h-96' : 'h-72 sm:h-80'}
          />
        ) : (
          <div className="grid h-72 place-items-center rounded-2xl bg-soft/40 text-sm text-muted sm:h-80">กำลังสุ่มกราฟ…</div>
        )}

        {!guess ? (
          <div className="mt-3">
            <p className="text-sm">
              <b>อีก 20 วันทำการ (ราว 1 เดือน)</b> ราคาจะสูงหรือต่ำกว่าแท่งสุดท้าย? ลองดูแนวโน้ม แนวรับ–แนวต้าน หรือตีเส้นก่อนตัดสินใจก็ได้
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="btn-up" disabled={!round} onClick={() => answer('up')}>
                📈 สูงกว่า
              </button>
              <button className="btn-down" disabled={!round} onClick={() => answer('down')}>
                📉 ต่ำกว่า
              </button>
            </div>
          </div>
        ) : (
          round && (
            <div className="mt-3">
              <div className={`rounded-2xl p-3 text-sm ${ok ? 'bg-up/10' : 'bg-down/10'}`}>
                <b>{ok ? '✓ ทายถูก!' : '✗ ทายผิด'}</b> ราคาจริง 20 วันต่อมา <b className={toneClass(change)}>{pct(change, 1)}</b>
                <span className="mt-0.5 block text-xs text-muted">
                  {round.ticker} ช่วง {thaiDate(round.from)} – {thaiDate(round.end)}
                </span>
              </div>
              {stats.played >= 10 && (
                <p className="mt-2 text-xs text-muted">
                  💡 ทายถูกราว 50–60% ถือว่าปกติมาก ราคาระยะสั้นมีความสุ่มสูง แม้มืออาชีพก็ทายได้ไม่แม่นกว่านี้มาก จุดประสงค์ของแบบฝึกคือฝึกอ่านสภาพกราฟ ไม่ใช่ทำนายให้ถูกทุกครั้ง
                </p>
              )}
              <button className="btn-primary mt-3 w-full" onClick={next}>
                ข้อต่อไป →
              </button>
            </div>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}
