import { useEffect, useState } from 'react';
import { planTotal } from '../engine/dca';
import { baht } from '../lib/format';
import { useGame } from '../store/gameStore';
import { PlanEditor } from './PlanEditor';

/**
 * Non-blocking card shown after an automatic DCA payday: says the money was invested,
 * lets the player adjust the plan, or switch to pausing on every payday.
 */
export function PaydayNotice() {
  const notice = useGame((s) => s.paydayNotice);
  const dca = useGame((s) => s.dca);
  const dismiss = useGame((s) => s.dismissPaydayNotice);
  const setPlan = useGame((s) => s.setPlan);
  const [hover, setHover] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    if (!notice || hover || planOpen) return;
    const t = setTimeout(() => {
      if (useGame.getState().paydayNotice?.id === notice.id) dismiss();
    }, 6000);
    return () => clearTimeout(t);
  }, [notice, hover, planOpen, dismiss]);

  if (!dca || (!notice && !planOpen)) return null;
  const hasPlan = planTotal(dca.plan) > 0;

  return (
    <>
      {notice && (
        <div
          className="pointer-events-auto absolute bottom-6 right-4 w-[300px]"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <div key={notice.id} className="card pop-in p-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-xl">💰</span>
              <div className="flex-1">
                <div className="font-semibold">เงินเข้า {baht(notice.amount)}</div>
                <div className="text-xs text-muted">{hasPlan ? 'ลงทุนตามแผนให้แล้ว' : 'กระจายลงทุนเท่า ๆ กันให้แล้ว'}</div>
              </div>
              <button className="text-muted hover:text-ink" onClick={dismiss} aria-label="ปิด">
                ✕
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={() => setPlanOpen(true)}>
                📋 ปรับแผน
              </button>
              <label className="flex flex-1 items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={!dca.auto}
                  onChange={(e) => setPlan(dca.plan, !e.target.checked)}
                />
                หยุดเกมทุกวันเงินเดือนออก
              </label>
            </div>
          </div>
        </div>
      )}
      {planOpen && <PlanEditor onClose={() => setPlanOpen(false)} />}
    </>
  );
}
