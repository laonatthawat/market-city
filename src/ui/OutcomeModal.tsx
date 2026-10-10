import { LineSeries, createChart } from 'lightweight-charts';
import type { ISeriesApi } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { DecisionOutcome } from '../engine/decisions/types';
import { pct, signedBaht, toneClass } from '../lib/format';
import { useGame } from '../store/gameStore';
import { chartOptions, cssVar, toTime } from './chartUtils';
import { STYLE_DOT } from './DecisionModal';

const STYLE_COLOR: Record<string, string> = { buy: '--up', hold: '--muted', sell: '--down', rebalance: '--lilac' };

/** "What happened next": replays every option's portfolio value over the fast-forwarded window. */
export function OutcomeModal() {
  const outcome = useGame((s) => s.outcome);
  const proceed = useGame((s) => s.continueAfterOutcome);
  const mode = useGame((s) => s.mode);
  if (!outcome) return null;
  const chosen = outcome.outcomes.find((o) => o.optionId === outcome.chosenId)!;
  const sorted = [...outcome.outcomes].sort((a, b) => b.ret - a.ret);
  const months = Math.max(1, Math.round(outcome.days.length / 21));

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center overflow-y-auto bg-black/15 p-4">
      <div className="card pop-in w-full max-w-2xl p-5">
        <span className="chip bg-soft text-muted">⏩ {months} เดือนต่อมา</span>
        <h2 className="mt-1 font-display text-xl font-semibold">เกิดอะไรขึ้นต่อจากนั้น?</h2>

        <ReplayChart outcome={outcome} />

        <table className="mt-2 w-full text-sm">
          <tbody>
            {sorted.map((o) => {
              const diff = o.values[o.values.length - 1] - chosen.values[chosen.values.length - 1];
              const mine = o.optionId === outcome.chosenId;
              return (
                <tr key={o.optionId} className={`border-t border-line ${mine ? 'bg-accent-soft/60' : ''}`}>
                  <td className="py-1.5 pl-2">
                    <i className={`mr-2 inline-block h-2 w-2 rounded-full ${STYLE_DOT[o.style]}`} />
                    {o.label} {mine && <span className="chip ml-1 bg-accent text-white">คุณเลือก</span>}
                  </td>
                  <td className={`py-1.5 text-right font-semibold ${toneClass(o.ret)}`}>{pct(o.ret, 1)}</td>
                  <td className="py-1.5 pr-2 text-right text-xs text-muted">{mine ? '—' : `${signedBaht(diff)} เทียบกับที่เลือก`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-3 space-y-1.5 text-sm leading-relaxed">
          {outcome.lesson.map((t, i) => (
            <p key={i} className={i === outcome.lesson.length - 1 ? 'rounded-2xl bg-soft p-2.5 text-xs text-muted' : ''}>
              {t}
            </p>
          ))}
        </div>

        {outcome.considerations.length > 0 && (
          <section className="mt-3">
            <h3 className="text-sm font-semibold">คำตอบที่ "ถูก" ขึ้นอยู่กับบริบท</h3>
            <ul className="mt-1 space-y-1 text-xs">
              {outcome.considerations.map((t, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-lilac">●</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button className="btn-primary mt-4 w-full" onClick={proceed}>
          {mode === 'tutorial' ? 'จบบทเรียน' : 'เล่นต่อ'}
        </button>
      </div>
    </div>
  );
}

function ReplayChart({ outcome }: { outcome: DecisionOutcome }) {
  const view = useGame((s) => s.view);
  const theme = useGame((s) => s.theme);
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current || !view) return;
    const chart = createChart(el.current, { ...chartOptions(view.windowStartDate), handleScroll: false, handleScale: false });
    chart.applyOptions({ localization: { priceFormatter: (p: number) => pct(p, 1) } });
    const times = outcome.days.map((d) => toTime(view.dateOf(d)));
    const series: { s: ISeriesApi<'Line'>; data: number[] }[] = outcome.outcomes.map((o) => {
      const mine = o.optionId === outcome.chosenId;
      const s = chart.addSeries(LineSeries, {
        color: mine ? cssVar('--accent') : cssVar(STYLE_COLOR[o.style]),
        lineWidth: mine ? 3 : 2,
        lineStyle: mine ? 0 : 2,
        priceLineVisible: false,
        lastValueVisible: mine,
        title: mine ? 'คุณ' : '',
      });
      return { s, data: o.values.map((v) => v / o.values[0] - 1) };
    });
    // Seed the full range so the axis is stable, then animate the reveal.
    chart.timeScale().setVisibleLogicalRange({ from: 0, to: times.length - 1 });
    let i = 1;
    const step = Math.max(1, Math.round(times.length / 45));
    const timer = setInterval(() => {
      const to = Math.min(times.length, i);
      for (const { s, data } of series) s.setData(data.slice(0, to).map((v, k) => ({ time: times[k], value: v })));
      chart.timeScale().fitContent();
      if (to >= times.length) clearInterval(timer);
      i += step;
    }, 30);
    return () => {
      clearInterval(timer);
      chart.remove();
    };
  }, [outcome, view, theme]);

  return <div ref={el} className="mt-3 h-48 w-full" />;
}
