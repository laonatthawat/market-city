import { useState } from 'react';
import { SECTORS } from '../data/sectors';
import type { SectorId } from '../engine/types';
import { SECTOR_IDS } from '../engine/types';
import { baht, pct, price, shares as fmtShares, signedBaht, toneClass } from '../lib/format';
import { loadJson, saveJson } from '../lib/storage';
import { useGame } from '../store/gameStore';
import { EquityChart } from './EquityChart';
import { useTutorialTarget } from './useTutorialTarget';

/** Compact side panel (portfolio / companies) that keeps most of the city visible. */
export function LeftPanel() {
  const [tab, setTab] = useState<'portfolio' | 'companies'>('portfolio');
  // Starts folded on phones, where the open panel would cover most of the city.
  const [open, setOpenState] = useState(() => loadJson('mc.panelOpen', true) && (typeof window === 'undefined' || window.innerWidth >= 640));
  const setOpen = (v: boolean) => {
    saveJson('mc.panelOpen', v);
    setOpenState(v);
  };
  // A tutorial step that points into the panel always shows it.
  const needed = useTutorialTarget<HTMLElement>('donut').active;
  if (!open && !needed) return <CollapsedChip onOpen={() => setOpen(true)} />;
  return (
    <aside className="card pop-in pointer-events-auto flex max-h-full w-[296px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 p-2">
        <div className="flex flex-1 rounded-2xl bg-soft p-0.5 text-xs">
          <button className={`tab !py-1 ${tab === 'portfolio' ? 'tab-active' : ''}`} onClick={() => setTab('portfolio')}>
            พอร์ตของฉัน
          </button>
          <button className={`tab !py-1 ${tab === 'companies' ? 'tab-active' : ''}`} onClick={() => setTab('companies')}>
            บริษัทในเมือง
          </button>
        </div>
        <button className="btn-soft h-7 w-7 !p-0 text-xs" onClick={() => setOpen(false)} aria-label="ย่อ" title="ย่อแผง">
          ◀
        </button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-3 pb-3">{tab === 'portfolio' ? <PortfolioTab /> : <CompanyList />}</div>
    </aside>
  );
}

function usePortfolioNumbers() {
  const run = useGame((s) => s.run)!;
  const equity = useGame((s) => s.equity);
  const last = equity[equity.length - 1];
  const value = last?.value ?? run.startingCash;
  // Money put in so far (DCA adds contributions); returns are measured against it.
  const invested = run.startingCash + equity.reduce((a, e) => a + e.contrib, 0);
  const indexValue = last?.index ?? invested;
  const ret = invested > 0 ? value / invested - 1 : 0;
  const indexRet = invested > 0 ? indexValue / invested - 1 : 0;
  return { value, invested, ret, indexRet };
}

function CollapsedChip({ onOpen }: { onOpen: () => void }) {
  const { value, ret } = usePortfolioNumbers();
  return (
    <button className="card pointer-events-auto flex items-center gap-2 px-3 py-2 text-sm" onClick={onOpen} title="เปิดแผงพอร์ต">
      <span>📊</span>
      <span className="font-semibold">{baht(value)}</span>
      <span className={`text-xs font-semibold ${toneClass(ret)}`}>{pct(ret)}</span>
      <span className="text-xs text-muted">▶</span>
    </button>
  );
}

function PortfolioTab() {
  const view = useGame((s) => s.view)!;
  const run = useGame((s) => s.run)!;
  const portfolio = useGame((s) => s.portfolio);
  const select = useGame((s) => s.select);
  const donutTarget = useTutorialTarget<HTMLElement>('donut');
  const days = useGame((s) => s.equity.length);
  useGame((s) => s.day);
  const { value, invested, ret, indexRet } = usePortfolioNumbers();
  const holdings = Object.values(portfolio.holdings).map((h) => {
    const px = view.close(h.companyId) ?? 0;
    return { ...h, px, value: h.shares * px, sector: view.company(h.companyId)!.sector };
  });
  holdings.sort((a, b) => b.value - a.value);

  const bySector = new Map<SectorId, number>();
  for (const h of holdings) bySector.set(h.sector, (bySector.get(h.sector) ?? 0) + h.value);
  const slices = [
    ...SECTOR_IDS.filter((s) => bySector.get(s)).map((s) => ({ label: SECTORS[s].nameTh, value: bySector.get(s)!, color: SECTORS[s].color })),
    { label: 'เงินสด', value: portfolio.cash, color: '#d9d2c7' },
  ];
  const total = Math.max(value, 1);
  const lead = ret - indexRet;

  return (
    <div className="space-y-3">
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-xl font-semibold">{baht(value)}</span>
          <span className={`chip ${ret >= 0 ? 'bg-up/15' : 'bg-down/15'} ${toneClass(ret)}`}>{pct(ret)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted">
          <span>
            กำไร/ขาดทุน <b className={toneClass(value - invested)}>{signedBaht(value - invested)}</b>
          </span>
          <span>
            ดัชนี <b className={toneClass(indexRet)}>{pct(indexRet)}</b>
          </span>
        </div>
        <div className="relative mt-1.5">
          <EquityChart height={78} mini />
          {days < 3 && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-soft px-3 text-center text-[11px] text-muted">
              กราฟพอร์ตเทียบดัชนีจะเริ่มวาดเมื่อเวลาเดิน
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <i className="inline-block h-1.5 w-3 rounded bg-accent" /> พอร์ต
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-1.5 w-3 rounded bg-lilac" /> ดัชนีเมือง
          </span>
          <span className={`ml-auto font-semibold ${toneClass(lead)}`}>{lead >= 0 ? `นำดัชนี ${pct(lead, 1, false)}` : `ตามดัชนี ${pct(-lead, 1, false)}`}</span>
        </div>
      </section>

      <section ref={donutTarget.ref} className={`rounded-2xl p-1 ${donutTarget.className}`}>
        <h3 className="stat-label mb-1">
          <span className="cursor-help" data-tip="เงินของคุณแบ่งอยู่ในกลุ่มธุรกิจไหนบ้าง ถ้ากองอยู่กลุ่มเดียวมากเกินไปจะเสี่ยงสูง">
            สัดส่วนพอร์ต ⓘ
          </span>
        </h3>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-soft">
          {slices.map((s) => (
            <i key={s.label} style={{ width: `${(Math.max(0, s.value) / total) * 100}%`, background: s.color }} />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px]">
          {slices.map((s) => (
            <span key={s.label} className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label} <b>{pct(s.value / total, 0, false)}</b>
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3 className="stat-label mb-1">หุ้นที่ถือ ({holdings.length})</h3>
        {holdings.length === 0 ? (
          <p className="rounded-2xl bg-soft p-2.5 text-[11px] text-muted">ยังไม่มีหุ้น — คลิกตึกในเมืองเพื่อดูข้อมูลและซื้อ</p>
        ) : (
          <ul className="space-y-0.5">
            {holdings.map((h) => {
              const pnl = h.costBasis > 0 ? h.value / h.costBasis - 1 : 0;
              return (
                <li key={h.companyId}>
                  <button className="flex w-full items-center gap-2 rounded-xl px-1.5 py-1 text-left text-xs hover:bg-soft" onClick={() => select(h.companyId, true)}>
                    <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SECTORS[h.sector].color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{run.disguisedNames[h.companyId]}</span>
                      <span className="block text-[10px] text-muted">
                        {fmtShares(h.shares)} หุ้น · {price(h.px)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold">{baht(h.value)}</span>
                      <span className={`block text-[10px] ${toneClass(pnl)}`}>{pct(pnl)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-1.5 text-[10px] text-muted">
          ค่าธรรมเนียม {baht(portfolio.feesPaid, 2)} · กำไรที่รับรู้แล้ว{' '}
          <span className={toneClass(portfolio.realizedPnl)}>{signedBaht(portfolio.realizedPnl)}</span>
        </p>
      </section>
    </div>
  );
}

type SortMode = 'sector' | 'up' | 'down' | 'held';
const SORTS: { id: SortMode; label: string }[] = [
  { id: 'sector', label: 'ตามย่าน' },
  { id: 'up', label: '▲ ขึ้นแรง' },
  { id: 'down', label: '▼ ลงแรง' },
  { id: 'held', label: '⚑ ที่ถือ' },
];

function CompanyList() {
  const view = useGame((s) => s.view)!;
  const run = useGame((s) => s.run)!;
  const holdings = useGame((s) => s.portfolio.holdings);
  const selectedId = useGame((s) => s.selectedId);
  const select = useGame((s) => s.select);
  const [sort, setSort] = useState<SortMode>('sector');
  useGame((s) => s.day);
  let rows = view.companies.map((c) => ({ c, snap: view.snapshot(c.id) }));
  if (sort === 'held') rows = rows.filter((r) => holdings[r.c.id]);
  const change = (r: (typeof rows)[number]) => r.snap?.change1d ?? 0;
  rows.sort((a, b) =>
    sort === 'up' ? change(b) - change(a) : sort === 'down' ? change(a) - change(b) : SECTOR_IDS.indexOf(a.c.sector) - SECTOR_IDS.indexOf(b.c.sector),
  );
  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-1.5 flex gap-1 bg-card-solid/90 px-1 py-1 backdrop-blur">
        {SORTS.map((o) => (
          <button key={o.id} className={`chip transition ${sort === o.id ? 'bg-accent text-white' : 'bg-soft text-muted hover:brightness-95'}`} onClick={() => setSort(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {rows.length === 0 && <p className="rounded-2xl bg-soft p-2.5 text-[11px] text-muted">ยังไม่ได้ถือหุ้นตัวไหน</p>}
      <ul className="space-y-1">
        {rows.map(({ c, snap }, i) => {
          const header = sort === 'sector' && (i === 0 || rows[i - 1].c.sector !== c.sector);
          return (
            <li key={c.id}>
              {header && (
                <div className="mb-0.5 mt-2 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted first:mt-0">
                  <i className="inline-block h-2 w-2 rounded-full" style={{ background: SECTORS[c.sector].color }} />
                  {SECTORS[c.sector].districtTh}
                </div>
              )}
              <button
                className={`flex w-full items-center gap-2 rounded-2xl px-2.5 py-2 text-left text-xs transition hover:bg-soft ${selectedId === c.id ? 'bg-soft ring-1 ring-accent/40' : ''}`}
                onClick={() => select(c.id, true)}
              >
                <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SECTORS[c.sector].color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {run.disguisedNames[c.id]} {holdings[c.id] && <span className="chip !px-1.5 !py-0 bg-accent-soft text-[10px] text-accent">ถืออยู่</span>}
                  </span>
                  <span className="block truncate text-muted">{SECTORS[c.sector].nameTh}</span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold">{snap ? price(snap.price) : '–'}</span>
                  <span className={`block ${toneClass(snap?.change1d ?? 0)}`}>{pct(snap?.change1d)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
