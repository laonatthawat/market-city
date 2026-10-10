import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SECTORS } from '../data/sectors';
import type { InvestPlan } from '../engine/dca';
import { SECTOR_IDS } from '../engine/types';
import { useGame } from '../store/gameStore';

/** Auto-Invest Plan editor: target % per company or per sector, executed on each payday. */
export function PlanEditor({ onClose }: { onClose: () => void }) {
  const view = useGame((s) => s.view)!;
  const run = useGame((s) => s.run)!;
  const dca = useGame((s) => s.dca)!;
  const setPlan = useGame((s) => s.setPlan);
  const initialBySector = Object.keys(dca.plan).some((k) => k.startsWith('sector:'));
  const [bySector, setBySector] = useState(initialBySector);
  const [plan, setLocal] = useState<InvestPlan>(dca.plan);
  const [auto, setAuto] = useState(dca.auto);

  const rows = bySector
    ? SECTOR_IDS.filter((s) => view.companies.some((c) => c.sector === s)).map((s) => ({ key: `sector:${s}`, label: SECTORS[s].nameTh, color: SECTORS[s].color }))
    : view.companies.map((c) => ({ key: c.id, label: run.disguisedNames[c.id], color: SECTORS[c.sector].color }));
  const total = rows.reduce((a, r) => a + (plan[r.key] ?? 0), 0);

  const switchMode = (sector: boolean) => {
    setBySector(sector);
    setLocal({});
  };
  const spreadEvenly = () => setLocal(Object.fromEntries(rows.map((r) => [r.key, Math.floor((100 / rows.length) * 10) / 10])));

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4" onClick={onClose}>
      <div className="card pop-in w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold">แผนลงทุนอัตโนมัติ</h2>
        <p className="mb-3 text-xs text-muted">กำหนดว่าเงินแต่ละเดือนจะถูกแบ่งไปซื้ออะไรกี่เปอร์เซ็นต์ ส่วนที่ไม่ได้กำหนดจะเก็บเป็นเงินสด</p>
        <div className="mb-2 flex rounded-2xl bg-soft p-0.5">
          <button className={`tab ${!bySector ? 'tab-active' : ''}`} onClick={() => switchMode(false)}>
            รายบริษัท
          </button>
          <button className={`tab ${bySector ? 'tab-active' : ''}`} onClick={() => switchMode(true)}>
            รายเซกเตอร์
          </button>
        </div>
        <div className="scroll-thin max-h-72 space-y-1 overflow-y-auto pr-1">
          {rows.map((r) => (
            <label key={r.key} className="flex items-center gap-2 text-sm">
              <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
              <span className="flex-1 truncate">{r.label}</span>
              <input
                className="input !w-20 !py-1 text-right"
                inputMode="decimal"
                value={plan[r.key] ?? ''}
                placeholder="0"
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value.replace(/[^\d.]/g, '')) || 0));
                  setLocal({ ...plan, [r.key]: v });
                }}
              />
              <span className="w-3 text-xs text-muted">%</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <button className="btn-soft !py-1 text-xs" onClick={spreadEvenly}>
            แบ่งเท่า ๆ กัน
          </button>
          <span className={total > 100.01 ? 'font-semibold text-down' : 'text-muted'}>รวม {total.toFixed(1)}% {total > 100.01 && '(เกิน 100%)'}</span>
        </div>
        {total === 0 && (
          <p className="mt-2 rounded-xl bg-soft px-2.5 py-1.5 text-[11px] text-muted">
            ยังไม่ได้ตั้งแผน: ระหว่างนี้เงินเดือนจะถูกแบ่งเท่า ๆ กันในหุ้นที่ถืออยู่ (ถ้ายังไม่มีหุ้น จะแบ่งให้ทุกบริษัทในเมือง)
          </p>
        )}
        {total > 0 && total < 99.99 && <p className="mt-2 text-[11px] text-muted">ส่วนที่เหลือ {(100 - total).toFixed(1)}% จะเก็บเป็นเงินสด</p>}
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          ลงทุนตามแผนให้อัตโนมัติทุกเดือน (ไม่ต้องถาม)
        </label>
        <div className="mt-4 flex gap-2">
          <button className="btn-soft flex-1" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="btn-primary flex-1"
            disabled={total > 100.01}
            onClick={() => {
              setPlan(plan, auto);
              onClose();
            }}
          >
            บันทึกแผน
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
