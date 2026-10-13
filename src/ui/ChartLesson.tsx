import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChartLesson, LessonSlide } from '../data/chartLessons';
import { annotationLine, barIndex, loadLessonBars } from '../engine/lessonData';
import { backtestStrategies } from '../engine/strategies';
import type { StrategyResult } from '../engine/strategies';
import { pct, price as fmtPrice, thaiDate, toneClass } from '../lib/format';
import { loadJson, saveJson } from '../lib/storage';
import { HistoryChart, IndicatorLegend } from './HistoryChart';

const DONE_KEY = 'mc.chartLessons';
export const loadChartLessonsDone = () => loadJson<string[]>(DONE_KEY, []);

/** Full-screen lesson: annotated chart (or candle diagram), explanation, quiz or click-the-chart task, then a summary. */
export function ChartLessonPlayer({ lesson, onClose, onDone }: { lesson: ChartLesson; onClose: () => void; onDone: (id: string) => void }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [picks, setPicks] = useState<Record<number, { guess: number; answer: number; ok: boolean }>>({});
  const finished = i >= lesson.slides.length;
  const slide = lesson.slides[i] as LessonSlide | undefined;
  const picked = answers[i];
  const pick = picks[i];
  const needsAnswer = (!!slide?.quiz && picked === undefined) || (!!slide?.pick && !pick);

  const next = () => {
    if (i === lesson.slides.length - 1) {
      const done = loadChartLessonsDone();
      if (!done.includes(lesson.id)) saveJson(DONE_KEY, [...done, lesson.id]);
      onDone(lesson.id);
    }
    setI(i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Check a click on the chart against the slide's level (support/resistance). */
  const onPick = async (price: number) => {
    if (!slide?.pick || !slide.chart || pick) return;
    const at = i;
    const level = slide.pick;
    const bars = await loadLessonBars(slide.chart.ticker);
    const pts = annotationLine(bars, { kind: 'level', ...level.level });
    if (!pts) return;
    const answer = pts[0].value;
    setPicks((p) => ({ ...p, [at]: { guess: price, answer, ok: Math.abs(price / answer - 1) <= level.tol } }));
  };

  const scored = lesson.slides.flatMap((s, k) => (s.quiz ? [!!s.quiz.options[answers[k]]?.correct] : s.pick ? [!!picks[k]?.ok] : []));
  const score = scored.filter(Boolean).length;

  // Portal: the start menu card is transformed (pop-in), which would trap a fixed overlay inside it.
  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-3 backdrop-blur-[2px] sm:p-4">
      <div className="card pop-in w-full max-w-2xl !bg-card-solid p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-accent font-display font-semibold text-white">{lesson.number}</div>
          <div className="min-w-0 flex-1">
            <div className="stat-label">อ่านกราฟเทคนิค · บทที่ {lesson.number}</div>
            <div className="truncate font-semibold">{lesson.title}</div>
          </div>
          <button className="btn-soft !h-9 !w-9 !p-0" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>
        <div className="mb-4 flex gap-1">
          {lesson.slides.map((_, k) => (
            <div key={k} className={`h-1.5 flex-1 rounded-full transition ${k < i || finished ? 'bg-accent' : k === i ? 'bg-accent/60' : 'bg-soft'}`} />
          ))}
        </div>

        {finished ? (
          <div>
            <div className="text-4xl">🎓</div>
            <h2 className="mt-1 font-display text-xl font-semibold">จบบทที่ {lesson.number} แล้ว!</h2>
            {scored.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                ตอบถูกตั้งแต่ครั้งแรก {score}/{scored.length} ข้อ
              </p>
            )}
            <ul className="mt-3 space-y-1.5 text-sm">
              {lesson.takeaways.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-up">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex gap-2">
              <button
                className="btn-soft flex-1"
                onClick={() => {
                  setAnswers({});
                  setPicks({});
                  setI(0);
                }}
              >
                ทบทวนอีกรอบ
              </button>
              <button className="btn-primary flex-1" onClick={onClose}>
                กลับไปหน้าบทเรียน
              </button>
            </div>
          </div>
        ) : (
          slide && (
            <div>
              {slide.anatomy && <CandleAnatomy />}
              {slide.chart && (
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
                    <span className="font-semibold text-ink">{slide.chart.ticker}</span>
                    <span>
                      {thaiDate(slide.chart.from)} – {thaiDate(slide.chart.to)}
                    </span>
                  </div>
                  <HistoryChart
                    spec={pick && slide.pick ? { ...slide.chart, annotations: [...(slide.chart.annotations ?? []), { kind: 'level', ...slide.pick.level, until: slide.chart.to, tone: 'up' }] } : slide.chart}
                    onClickPrice={slide.pick && !pick ? onPick : undefined}
                    lines={pick ? [{ price: pick.guess, tone: pick.ok ? 'up' : 'down', label: 'คุณเลือก' }] : []}
                    className={slide.chart.indicators?.includes('rsi') ? 'h-72 sm:h-80' : 'h-60 sm:h-72'}
                  />
                  <IndicatorLegend indicators={slide.chart.indicators} />
                </div>
              )}
              {slide.backtest && <BacktestTable tickers={slide.backtest.tickers} from={slide.backtest.from} />}
              <h2 className="mt-3 font-display text-lg font-semibold">{slide.title}</h2>
              <p className="mt-1 text-sm leading-relaxed">{slide.text}</p>
              {slide.pick && (
                <div className={`mt-3 rounded-2xl p-3 text-sm ${!pick ? 'bg-accent-soft font-semibold' : pick.ok ? 'bg-up/10' : 'bg-down/10'}`}>
                  {!pick ? (
                    <>👆 {slide.pick.prompt}</>
                  ) : (
                    <>
                      <b>{pick.ok ? '✓ ' : '✗ '}</b>
                      {pick.ok ? slide.pick.ok : slide.pick.miss}
                      <span className="mt-0.5 block text-xs text-muted">
                        คุณเลือก {fmtPrice(pick.guess)} · แนวรับอยู่ที่ราว {fmtPrice(pick.answer)} (ห่าง {pct(pick.guess / pick.answer - 1, 1)})
                      </span>
                    </>
                  )}
                </div>
              )}
              {slide.quiz && (
                <div className="mt-3">
                  <div className="mb-1.5 text-sm font-semibold">{slide.quiz.question}</div>
                  <div className="grid gap-1.5">
                    {slide.quiz.options.map((o, k) => {
                      const shown = picked !== undefined;
                      const state = !shown ? '' : o.correct ? 'border-up bg-up/10' : k === picked ? 'border-down bg-down/10' : 'opacity-60';
                      return (
                        <button key={o.label} disabled={shown} onClick={() => setAnswers({ ...answers, [i]: k })} className={`rounded-2xl border border-line bg-card-solid px-3 py-2 text-left text-sm transition enabled:hover:border-accent ${state}`}>
                          <span className="font-semibold">
                            {shown && o.correct ? '✓ ' : shown && k === picked ? '✗ ' : ''}
                            {o.label}
                          </span>
                          {shown && (o.correct || k === picked) && <span className="mt-0.5 block text-xs text-muted">{o.why}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button className="btn-soft" onClick={() => setI(i - 1)} disabled={i === 0}>
                  ← ก่อนหน้า
                </button>
                <button className="btn-primary flex-1" onClick={next} disabled={needsAnswer}>
                  {needsAnswer ? (slide.pick ? 'คลิกบนกราฟก่อน' : 'เลือกคำตอบก่อน') : i === lesson.slides.length - 1 ? 'จบบทเรียน ✓' : 'ถัดไป →'}
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Buy-and-hold vs two signal strategies, computed live from the bundled data. */
function BacktestTable({ tickers, from }: { tickers: string[]; from: string }) {
  const [rows, setRows] = useState<({ ticker: string } & StrategyResult)[] | null>(null);
  const [failed, setFailed] = useState(false);
  const key = tickers.join(',');
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      key.split(',').map(async (t) => {
        const bars = await loadLessonBars(t);
        return { ticker: t, ...backtestStrategies(bars.map((b) => b.close), barIndex(bars, from)) };
      }),
    ).then(
      (r) => !cancelled && setRows(r),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [key, from]);
  if (failed) return <p className="rounded-2xl bg-soft p-3 text-sm text-muted">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</p>;
  if (!rows) return <p className="rounded-2xl bg-soft p-3 text-sm text-muted">กำลังคำนวณจากข้อมูลจริง…</p>;
  const best = (r: StrategyResult) => Math.max(r.hold, r.maCross, r.rsi);
  const holdWins = rows.filter((r) => r.hold === best(r)).length;
  const cell = (v: number, win: boolean) => (
    <td className={`px-2 py-1 text-right tabular-nums ${toneClass(v)} ${win ? 'font-bold' : ''}`}>
      {win ? '🏆 ' : ''}
      {pct(v, 0)}
    </td>
  );
  return (
    <div>
      <div className="scroll-thin max-h-64 overflow-auto rounded-2xl border border-line">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-soft text-muted">
            <tr>
              <th className="px-2 py-1.5 text-left">หุ้น</th>
              <th className="px-2 py-1.5 text-right">ถือยาว</th>
              <th className="px-2 py-1.5 text-right">MA50/200</th>
              <th className="px-2 py-1.5 text-right">RSI 30/70</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} className="border-t border-line">
                <td className="px-2 py-1 font-semibold">{r.ticker}</td>
                {cell(r.hold, r.hold === best(r))}
                {cell(r.maCross, r.maCross === best(r))}
                {cell(r.rsi, r.rsi === best(r))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 rounded-2xl bg-accent-soft p-2.5 text-sm">
        ผลรวม: <b>ถือยาวชนะ {holdWins} จาก {rows.length} ตัว</b> กลยุทธ์อาจชนะได้ในบางหุ้น แต่จะรู้ว่าหุ้นไหนได้ผลก็ต่อเมื่อมองย้อนหลังแล้วเท่านั้น
      </p>
    </div>
  );
}

/** Labelled diagram of a green and a red candle. */
function CandleAnatomy() {
  const label = 'fill-ink text-[11px]';
  const muted = 'fill-muted text-[10px]';
  const candle = (x: number, green: boolean) => {
    const top = green ? 70 : 60;
    const bottom = green ? 150 : 160;
    const col = green ? 'var(--up)' : 'var(--down)';
    return (
      <g>
        <line x1={x} x2={x} y1={28} y2={190} stroke={col} strokeWidth={3} strokeLinecap="round" />
        <rect x={x - 22} y={top} width={44} height={bottom - top} rx={5} fill={col} />
      </g>
    );
  };
  const tick = (x1: number, x2: number, y: number) => <line x1={x1} x2={x2} y1={y} y2={y} stroke="var(--muted)" strokeDasharray="3 3" />;
  return (
    <div className="rounded-2xl bg-soft/40 p-2">
      <svg viewBox="0 0 520 220" className="mx-auto block h-60 w-full max-w-xl sm:h-72" role="img" aria-label="ส่วนประกอบของแท่งเทียน">
        {/* Green candle (left): opens at the bottom of the body, closes at the top. */}
        {candle(150, true)}
        {tick(175, 205, 28)}
        <text x={210} y={32} className={label}>
          สูงสุด
        </text>
        {tick(175, 205, 70)}
        <text x={210} y={74} className={label}>
          ปิด
        </text>
        {tick(175, 205, 150)}
        <text x={210} y={154} className={label}>
          เปิด
        </text>
        {tick(175, 205, 190)}
        <text x={210} y={194} className={label}>
          ต่ำสุด
        </text>
        <text x={95} y={112} textAnchor="end" className={label}>
          ตัวเทียน
        </text>
        <text x={135} y={50} textAnchor="end" className={muted}>
          ไส้บน
        </text>
        <text x={135} y={174} textAnchor="end" className={muted}>
          ไส้ล่าง
        </text>
        <text x={150} y={214} textAnchor="middle" className="fill-up text-[12px] font-semibold">
          แท่งเขียว: ปิด &gt; เปิด
        </text>
        {/* Red candle (right): opens at the top, closes at the bottom. */}
        {candle(380, false)}
        {tick(405, 435, 60)}
        <text x={440} y={64} className={label}>
          เปิด
        </text>
        {tick(405, 435, 160)}
        <text x={440} y={164} className={label}>
          ปิด
        </text>
        <text x={380} y={214} textAnchor="middle" className="fill-down text-[12px] font-semibold">
          แท่งแดง: ปิด &lt; เปิด
        </text>
      </svg>
    </div>
  );
}
