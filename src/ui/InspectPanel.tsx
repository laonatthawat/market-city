import { useEffect, useMemo, useRef, useState } from 'react';
import { SECTORS } from '../data/sectors';
import { disguisedTicker } from '../engine/disguise';
import { healthScore } from '../engine/health';
import { companyNews } from '../engine/news';
import { averageCost, maxAffordableShares, quote } from '../engine/portfolio';
import { formatAnonDay } from '../engine/anonDate';
import { baht, bigBaht, pct, price, ratio, shares as fmtShares, signedBaht, toneClass } from '../lib/format';
import { useGame } from '../store/gameStore';
import { PriceChart } from './PriceChart';
import { useTutorialTarget } from './useTutorialTarget';

export function InspectPanel() {
  const id = useGame((s) => s.selectedId);
  const view = useGame((s) => s.view);
  const run = useGame((s) => s.run);
  const select = useGame((s) => s.select);
  const holdings = useGame((s) => s.portfolio.holdings);
  // Trading waits while a decision or its outcome is on screen.
  const tradeLocked = useGame((s) => s.flow !== 'normal' && s.flow !== 'payday');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const tradeRef = useRef<HTMLElement>(null);
  useGame((s) => s.day);
  // Each company opens on the buy side.
  useEffect(() => setSide('buy'), [id]);
  if (!id || !view || !run) return null;
  const company = view.company(id);
  const snap = view.snapshot(id);
  const f = view.fundamentals(id);
  if (!company || !snap || !f) return null;
  const name = run.disguisedNames[id];
  const sector = SECTORS[company.sector];
  const jumpToTrade = (to: 'buy' | 'sell') => {
    setSide(to);
    tradeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('qty')?.focus({ preventScroll: true }), 350);
  };

  return (
    <aside className="card pop-in pointer-events-auto flex max-h-full w-[420px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden max-sm:h-full max-sm:w-full">
      <header className="flex items-start gap-3 border-b border-line p-4 pb-3">
        <div className="mt-1 h-10 w-10 shrink-0 rounded-2xl" style={{ background: sector.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-lg font-semibold">{name}</h2>
            <span className="chip bg-soft text-muted">{disguisedTicker(name)}</span>
          </div>
          <p className="text-xs text-muted">
            {sector.nameTh} · {company.disguisedDescription}
          </p>
        </div>
        <button className="btn-soft h-8 w-8 !p-0" onClick={() => select(null)} aria-label="ปิด" data-tip="ปิด (Esc)" data-tip-end="">
          ✕
        </button>
      </header>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-end gap-3">
          <div className="font-display text-3xl font-semibold">{price(snap.price)}</div>
          <div className={`pb-1 text-sm font-semibold ${toneClass(snap.change1d)}`}>
            {signedBaht(snap.price - snap.prevClose)} ({pct(snap.change1d)})
          </div>
        </div>

        <ChartBox id={id} />

        <section>
          <h3 className="mb-2 text-sm font-semibold">ปัจจัยพื้นฐาน</h3>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="มูลค่าตลาด" value={bigBaht(f.marketCap)} tip="ราคาหุ้น × จำนวนหุ้นทั้งหมด = ขนาดบริษัทในสายตาตลาด (ความสูงของตึก)" />
            <Stat label="P/E" value={f.pe == null ? 'ขาดทุน' : ratio(f.pe)} tip="ราคาเทียบกำไรต่อหุ้น: จ่ายกี่บาทต่อกำไร 1 บาท ยิ่งสูงยิ่งแพง (ต้องเทียบกับบริษัทกลุ่มเดียวกัน)" />
            <Stat label="P/B" value={ratio(f.pb)} tip="ราคาเทียบมูลค่าทางบัญชี ต่ำกว่า 1 = ราคาต่ำกว่าทรัพย์สินสุทธิ" />
            <Stat label="รายได้โต (ปี)" value={pct(f.revenueGrowth, 1)} tone={f.revenueGrowth ?? 0} tip="ยอดขายปีล่าสุดโตขึ้นกี่ % จากปีก่อน" />
            <Stat label="อัตรากำไรสุทธิ" value={pct(f.netMargin, 1, false)} tone={f.netMargin} tip="ขายได้ 100 บาท เหลือเป็นกำไรกี่บาท" />
            <Stat label="หนี้/ทุน (D/E)" value={ratio(f.debtToEquity, 2)} tip="หนี้สินเทียบส่วนของผู้ถือหุ้น ยิ่งสูงยิ่งเสี่ยงเมื่อเศรษฐกิจไม่ดี" />
            <Stat label="ปันผล" value={pct(f.dividendYield, 2, false)} tip="เงินปันผลต่อปีเทียบราคาหุ้น (ได้เป็นเงินสดเข้าพอร์ต)" />
            <Stat label="รายได้ (ปี)" value={bigBaht(f.revenue)} tip="ยอดขายทั้งปี (ความกว้างของตึก)" />
            <EpsTrend trend={f.epsTrend} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">* งบการเงินเป็นค่าประมาณรายปี (งบปีล่าสุดที่ประกาศแล้ว)</p>
        </section>

        <Health id={id} />
        <TradeForm key={id} id={id} name={name} side={side} setSide={setSide} sectionRef={tradeRef} />
        <News id={id} name={name} />
      </div>
      {/* Always-visible shortcut to the trade form, which sits below the fundamentals. */}
      <footer className="flex gap-2 border-t border-line p-3">
        <button className="btn-up flex-1" onClick={() => jumpToTrade('buy')} disabled={tradeLocked} data-tip={tradeLocked ? 'ซื้อขายได้หลังตัดสินใจเสร็จ' : undefined}>
          ซื้อ
        </button>
        <button
          className="btn-down flex-1"
          onClick={() => jumpToTrade('sell')}
          disabled={!holdings[id] || tradeLocked}
          data-tip={tradeLocked ? 'ซื้อขายได้หลังตัดสินใจเสร็จ' : holdings[id] ? undefined : 'ยังไม่มีหุ้นตัวนี้ให้ขาย'}
        >
          ขาย
        </button>
      </footer>
    </aside>
  );
}

function ChartBox({ id }: { id: string }) {
  const t = useTutorialTarget<HTMLDivElement>('chart');
  return (
    <div ref={t.ref} className={`p-1 ${t.className}`}>
      <PriceChart companyId={id} />
    </div>
  );
}

function Stat({ label, value, tone, tip }: { label: string; value: string; tone?: number; tip?: string }) {
  return (
    <div className={`rounded-2xl bg-soft px-2.5 py-2 ${tip ? 'cursor-help' : ''}`} data-tip={tip}>
      <div className="stat-label">
        {label} {tip && <span className="opacity-60">ⓘ</span>}
      </div>
      <div className={`truncate text-sm font-semibold ${tone !== undefined ? toneClass(tone) : ''}`}>{value}</div>
    </div>
  );
}

function EpsTrend({ trend }: { trend: { year: number; eps: number }[] }) {
  const max = Math.max(...trend.map((t) => Math.abs(t.eps)), 1e-9);
  return (
    <div className="rounded-2xl bg-soft px-2.5 py-2">
      <div className="stat-label">แนวโน้ม EPS</div>
      <div className="mt-1 flex h-6 items-end gap-1">
        {trend.map((t, i) => (
          <div
            key={t.year}
            title={`EPS ${price(t.eps)}`}
            className={`flex-1 rounded-sm ${t.eps >= 0 ? 'bg-up' : 'bg-down'}`}
            style={{ height: `${Math.max(8, (Math.abs(t.eps) / max) * 100)}%`, opacity: 0.45 + (i / trend.length) * 0.55 }}
          />
        ))}
      </div>
    </div>
  );
}

function Health({ id }: { id: string }) {
  const view = useGame((s) => s.view)!;
  const f = view.fundamentals(id)!;
  const h = healthScore(f, view.company(id)!.sector);
  const color = h.score >= 70 ? 'var(--up)' : h.score >= 45 ? '#f2a03d' : 'var(--down)';
  return (
    <section className="rounded-3xl border border-line p-3">
      <div className="mb-2 flex items-center gap-3">
        <div
          className="grid h-12 w-12 place-items-center rounded-full text-sm font-bold"
          style={{ background: `conic-gradient(${color} ${h.score * 3.6}deg, var(--soft) 0)` }}
        >
          <div className="grid h-9 w-9 place-items-center rounded-full bg-card-solid">{h.score}</div>
        </div>
        <div>
          <div className="text-sm font-semibold">คะแนนสุขภาพ: {h.label}</div>
          <div className="text-[11px] text-muted">ใช้ประกอบการเรียนรู้เท่านั้น ไม่ใช่คำแนะนำการลงทุน</div>
        </div>
      </div>
      <ul className="space-y-1 text-xs">
        {h.reasons.map((r, i) => (
          <li key={i} className="flex gap-1.5">
            <span className={r.tone === 'good' ? 'text-up' : r.tone === 'bad' ? 'text-down' : 'text-muted'}>
              {r.tone === 'good' ? '▲' : r.tone === 'bad' ? '▼' : '●'}
            </span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TradeForm({
  id,
  name,
  side,
  setSide,
  sectionRef,
}: {
  id: string;
  name: string;
  side: 'buy' | 'sell';
  setSide: (s: 'buy' | 'sell') => void;
  sectionRef: React.RefObject<HTMLElement | null>;
}) {
  const view = useGame((s) => s.view)!;
  const portfolio = useGame((s) => s.portfolio);
  const trade = useGame((s) => s.trade);
  const target = useTutorialTarget<HTMLElement>('trade-form');
  const [qtyText, setQtyText] = useState('');
  const px = view.close(id) ?? 0;
  const holding = portfolio.holdings[id];
  // Buys are whole shares; sells may include fractions left by automatic (DCA/plan) purchases.
  const raw = Number(qtyText.replace(/,/g, '')) || 0;
  const qty = side === 'buy' ? Math.floor(raw) : Math.floor(raw * 10000) / 10000;
  const q = quote(side, qty, px);
  const maxBuy = maxAffordableShares(portfolio.cash, px);
  const maxSell = holding?.shares ?? 0;
  const tooMuch = side === 'buy' ? q.total > portfolio.cash : qty > maxSell;

  const setFraction = (fr: number) => {
    const n = side === 'buy' ? maxAffordableShares(portfolio.cash * fr, px) : fr >= 1 ? maxSell : Math.floor(maxSell * fr);
    setQtyText(String(n));
  };

  const submit = () => {
    if (trade(side, id, qty)) setQtyText('');
  };

  return (
    <section
      ref={(el) => {
        target.ref.current = el;
        sectionRef.current = el;
      }}
      className={`scroll-mt-4 rounded-3xl border border-line p-3 ${target.className}`}
    >
      <div className="mb-3 flex rounded-2xl bg-soft p-0.5">
        <button className={`tab ${side === 'buy' ? 'tab-active !text-up' : ''}`} onClick={() => setSide('buy')}>
          ซื้อ
        </button>
        <button className={`tab ${side === 'sell' ? 'tab-active !text-down' : ''}`} onClick={() => setSide('sell')}>
          ขาย
        </button>
      </div>

      {holding && (
        <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="stat-label">ถืออยู่</div>
            <div className="font-semibold">{fmtShares(holding.shares)} หุ้น</div>
          </div>
          <div>
            <div className="stat-label">ต้นทุนเฉลี่ย</div>
            <div className="font-semibold">{price(averageCost(holding))}</div>
          </div>
          <div>
            <div className="stat-label">กำไร/ขาดทุน</div>
            <div className={`font-semibold ${toneClass(holding.shares * px - holding.costBasis)}`}>
              {pct(holding.costBasis > 0 ? (holding.shares * px) / holding.costBasis - 1 : 0)}
            </div>
          </div>
        </div>
      )}

      <label className="stat-label" htmlFor="qty">
        จำนวนหุ้น (สูงสุด {fmtShares(side === 'buy' ? maxBuy : maxSell)})
      </label>
      <div className="mt-1 flex gap-1.5">
        <button className="btn-soft !px-3" onClick={() => setQtyText(String(Math.max(0, qty - 1)))}>
          −
        </button>
        <input
          id="qty"
          className="input text-center"
          inputMode="numeric"
          placeholder="0"
          value={qtyText}
          onChange={(e) => setQtyText(e.target.value.replace(side === 'buy' ? /[^\d]/g : /[^\d.]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn-soft !px-3" onClick={() => setQtyText(String(qty + 1))}>
          +
        </button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {[0.1, 0.25, 0.5, 1].map((fr) => (
          <button key={fr} className="btn-soft !px-0 !py-1 text-xs" onClick={() => setFraction(fr)}>
            {fr === 1 ? (side === 'buy' ? 'สูงสุด' : 'ทั้งหมด') : `${fr * 100}%`}
          </button>
        ))}
      </div>

      <dl className="mt-3 space-y-1 text-xs">
        <Row label={`ราคาต่อหุ้น (ราคาปิดวันนี้)`} value={price(px)} />
        <Row label="มูลค่าซื้อขาย" value={baht(q.gross, 2)} />
        <Row label="ค่าธรรมเนียม (0.15%)" value={baht(q.fee, 2)} />
        <Row label={side === 'buy' ? 'รวมจ่าย' : 'รับสุทธิ'} value={baht(q.total, 2)} bold />
        <Row label="เงินสดคงเหลือ" value={baht(portfolio.cash, 2)} />
      </dl>

      <button
        className={`${side === 'buy' ? 'btn-up' : 'btn-down'} mt-3 w-full`}
        disabled={qty <= 0 || tooMuch || px <= 0}
        onClick={submit}
      >
        {side === 'buy' ? 'ซื้อ' : 'ขาย'} {name} {qty > 0 ? `${fmtShares(qty)} หุ้น` : ''}
      </button>
      {tooMuch && qty > 0 && (
        <p className="mt-1.5 text-center text-xs text-down">{side === 'buy' ? 'เงินสดไม่พอ' : 'มีหุ้นไม่พอขาย'}</p>
      )}
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={bold ? 'font-semibold' : ''}>{value}</dd>
    </div>
  );
}

function News({ id, name }: { id: string; name: string }) {
  const view = useGame((s) => s.view)!;
  const day = useGame((s) => s.day);
  const items = useMemo(() => companyNews(view, id, name), [view, id, name, day]);
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">ข่าวในเมือง</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted">ยังไม่มีข่าวสำคัญ</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((n) => (
            <li key={`${n.day}-${n.text}`} className="rounded-2xl bg-soft px-3 py-2 text-xs">
              <div className="text-[10px] text-muted">{formatAnonDay(n.date, view.windowStartDate)}</div>
              <div className={n.tone === 'good' ? 'text-up' : n.tone === 'bad' ? 'text-down' : ''}>{n.text}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
