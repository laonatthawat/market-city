import { useState } from 'react';
import { DECISION_TEXT } from '../data/decisionText';
import type { OptionStyle } from '../engine/decisions/types';
import { toneClass } from '../lib/format';
import { useGame } from '../store/gameStore';

export const STYLE_CLASS: Record<OptionStyle, string> = {
  buy: 'border-up/40 hover:bg-up/10',
  hold: 'border-line hover:bg-soft',
  sell: 'border-down/40 hover:bg-down/10',
  rebalance: 'border-lilac/60 hover:bg-lilac/15',
};

export const STYLE_DOT: Record<OptionStyle, string> = {
  buy: 'bg-up',
  hold: 'bg-muted',
  sell: 'bg-down',
  rebalance: 'bg-lilac',
};

/** Auto-pause card shown when a Decision Point triggers. */
export function DecisionModal() {
  const dp = useGame((s) => s.decision);
  const choose = useGame((s) => s.chooseOption);
  const skip = useGame((s) => s.skipDecision);
  const tutorial = useGame((s) => s.mode === 'tutorial');
  const view = useGame((s) => s.view);
  const portfolioHoldings = useGame((s) => s.portfolio.holdings);
  const [minimized, setMinimized] = useState(false);
  if (!dp || !view) return null;

  if (minimized) {
    return (
      <div className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2">
        <button className="btn-primary pop-in !px-5 !py-3 shadow-soft" onClick={() => setMinimized(false)}>
          ⏸ มีเรื่องให้ตัดสินใจ: {dp.title}
        </button>
      </div>
    );
  }

  const chip = dp.type === 'scripted' ? 'บทเรียน' : dp.type === 'event' ? 'เหตุการณ์สำคัญ' : DECISION_TEXT[dp.type].chip;
  const series = dp.companyId ? view.history(dp.companyId, dp.day - 126) : view.indexHistory(dp.day - 126);

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/15 p-4">
      <div className="card pop-in w-full max-w-xl p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="chip bg-accent-soft text-accent">⏸ จุดตัดสินใจ · {chip}</span>
          <span className="ml-auto text-xs text-muted">เกมหยุดรอคุณอยู่</span>
        </div>
        <h2 className="font-display text-xl font-semibold">{dp.title}</h2>
        <p className="mt-1 text-sm leading-relaxed">{dp.prompt}</p>

        <div className="mt-3 flex gap-3">
          <Sparkline values={series.map((b) => b.close)} />
          <div className="grid flex-1 grid-cols-2 gap-1.5">
            {dp.facts.map((f) => (
              <div key={f.label} className="rounded-xl bg-soft px-2.5 py-1.5">
                <div className="stat-label">{f.label}</div>
                <div className={`truncate text-sm font-semibold ${f.tone !== undefined ? toneClass(f.tone) : ''}`}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {dp.options.map((o) => (
            <button
              key={o.id}
              className={`rounded-2xl border-2 bg-card-solid px-3 py-2.5 text-left transition active:scale-[0.98] ${STYLE_CLASS[o.style]}`}
              onClick={() => choose(o.id)}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <i className={`inline-block h-2 w-2 rounded-full ${STYLE_DOT[o.style]}`} />
                {o.label}
              </div>
              <div className="mt-0.5 text-xs text-muted">{o.detail}</div>
            </button>
          ))}
        </div>

        {!dp.companyId || dp.companyId in portfolioHoldings ? null : (
          <p className="mt-2 text-[11px] text-muted">คุณยังไม่ได้ถือหุ้นตัวนี้ จึงไม่มีตัวเลือกขาย</p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>เลือกแล้วเกมจะเร่งเวลาไปข้างหน้าราว {Math.max(1, Math.round(dp.forwardDays / 21))} เดือน เพื่อให้เห็นว่าเกิดอะไรขึ้นต่อ</span>
          <div className="flex shrink-0 gap-1.5">
            {dp.companyId && (
              <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={() => setMinimized(true)}>
                ดูข้อมูลบริษัทก่อน
              </button>
            )}
            {!tutorial && (
              <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={skip} title="ปิดโดยไม่ตัดสินใจ เล่นต่อทันที ไม่เร่งเวลา">
                ข้าม ▶
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ values, width = 150, height = 96 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 4 - ((v - min) / span) * (height - 8)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} className="shrink-0 rounded-xl bg-soft" aria-label="กราฟราคา 6 เดือน">
      <polyline points={pts} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
