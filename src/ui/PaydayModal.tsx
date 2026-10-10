import { useState } from 'react';
import { planTotal } from '../engine/dca';
import { baht } from '../lib/format';
import { useGame } from '../store/gameStore';
import { PlanEditor } from './PlanEditor';

/** Monthly DCA payday: cash arrives and the player chooses where it goes. */
export function PaydayModal() {
  const payday = useGame((s) => s.payday);
  const dca = useGame((s) => s.dca);
  const resolve = useGame((s) => s.resolvePayday);
  const holdings = useGame((s) => s.portfolio.holdings);
  const [planOpen, setPlanOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [auto, setAuto] = useState(dca?.auto ?? true);
  if (!payday || !dca) return null;
  const hasPlan = planTotal(dca.plan) > 0;
  const heldCount = Object.keys(holdings).length;

  if (manual) {
    return (
      <div className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2">
        <div className="card pop-in flex items-center gap-3 px-4 py-3 text-sm">
          💰 ซื้อหุ้นเองจากแผงบริษัทได้เลย (เงินเดือนนี้ {baht(payday.amount)})
          <button className="btn-primary !py-1.5" onClick={() => resolve('manual', { auto })}>
            เสร็จแล้ว เล่นต่อ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/10 p-4">
      <div className="card pop-in w-full max-w-md p-5">
        <div className="text-3xl">💰</div>
        <h2 className="font-display text-xl font-semibold">วันเงินเดือนออก!</h2>
        <p className="text-sm">
          เงินลงทุนเดือนนี้ <b>{baht(payday.amount)}</b> เข้าบัญชีแล้ว จะลงทุนอย่างไร?
        </p>
        {payday.inDrop && (
          <p className="mt-2 rounded-2xl bg-accent-soft p-3 text-xs leading-relaxed">
            🌧️ ตลาดกำลังลงแรงกว่า 10% จากจุดสูงสุด หลายคนเลือกหยุดลงทุนช่วงนี้ แต่สำหรับ DCA ช่วงราคาลงคือช่วงที่เงินเท่าเดิมซื้อหุ้นได้มากขึ้น
            ยังจะลงทุนเดือนนี้ไหม?
          </p>
        )}
        <div className="mt-3 grid gap-2">
          <button className="btn-up" disabled={!hasPlan} onClick={() => resolve('plan', { auto })}>
            ลงทุนตามแผนอัตโนมัติ {!hasPlan && '(ยังไม่ได้ตั้งแผน)'}
          </button>
          <button className="btn-soft" onClick={() => resolve('equal', { auto })}>
            กระจายเท่า ๆ กันใน{heldCount ? `หุ้นที่ถือ ${heldCount} ตัว` : 'ทุกบริษัทในเมือง'}
          </button>
          <button className="btn-soft" onClick={() => setManual(true)}>
            เลือกซื้อเอง
          </button>
          <button className="btn-soft !text-down" onClick={() => resolve('skip', { auto })}>
            ข้ามเดือนนี้ เก็บเป็นเงินสด
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <button className="chip bg-accent-soft text-accent" onClick={() => setPlanOpen(true)}>
            📋 ตั้งแผนอัตโนมัติ
          </button>
        </div>
        <label className="mt-3 flex items-start gap-2 rounded-2xl bg-soft p-2.5 text-xs">
          <input type="checkbox" className="mt-0.5" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>
            เดือนต่อไปลงทุนให้อัตโนมัติ{hasPlan ? 'ตามแผน' : ' กระจายเท่า ๆ กัน'} ไม่ต้องถามทุกเดือน
            <span className="block text-muted">เกมจะถามอีกครั้งเฉพาะตอนตลาดลงแรงเกิน 10%</span>
          </span>
        </label>
        {planOpen && <PlanEditor onClose={() => setPlanOpen(false)} />}
      </div>
    </div>
  );
}
