import type { ReactNode } from 'react';
import { decoDef } from '../data/unlocks';
import type { DecoKind } from '../data/unlocks';
import { changeOver } from '../engine/indicators';
import { baht, pct, toneClass } from '../lib/format';
import { useGame } from '../store/gameStore';

/** Info card for the Reserve Bank and the civic buildings: what they are and what they do. */
export function LandmarkPanel() {
  const id = useGame((s) => s.landmark);
  const close = useGame((s) => s.selectLandmark);
  if (!id) return null;
  return (
    <aside className="card pop-in pointer-events-auto scroll-thin max-h-full w-[340px] overflow-y-auto p-4 max-sm:w-full">
      {id === 'bank' ? <BankInfo /> : id === 'index' ? <IndexInfo /> : <CivicInfo kind={id as DecoKind} />}
      <button className="btn-soft mt-3 w-full text-sm" onClick={() => close(null)}>
        ปิด
      </button>
    </aside>
  );
}

function Header({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <header className="flex items-start gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-soft text-2xl">{icon}</div>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
    </header>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="stat-label mb-0.5">{label}</h3>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function BankInfo() {
  const view = useGame((s) => s.view);
  const portfolio = useGame((s) => s.portfolio);
  useGame((s) => s.day);
  let invested = 0;
  if (view) for (const h of Object.values(portfolio.holdings)) invested += h.shares * (view.close(h.companyId) ?? 0);
  const total = invested + portfolio.cash;
  const share = total > 0 ? portfolio.cash / total : 1;
  return (
    <>
      <Header icon="🏦" title="ธนาคารสำรอง" subtitle="ตัวแทนเงินสดในพอร์ตของคุณ" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-soft px-3 py-2">
          <div className="stat-label">เงินสดตอนนี้</div>
          <div className="font-display font-semibold">{baht(portfolio.cash)}</div>
        </div>
        <div className="rounded-2xl bg-soft px-3 py-2">
          <div className="stat-label">สัดส่วนในพอร์ต</div>
          <div className="font-display font-semibold">{pct(share, 0, false)}</div>
        </div>
      </div>
      <Row label="ทำหน้าที่อะไร">
        ตึกใหญ่ขึ้นตามสัดส่วนเงินสดในพอร์ต และโดมจะเรืองแสงสีทองเมื่อมีเงินสดอย่างน้อย 10% ไม่ได้ซื้อขายอะไรเอง เป็นตัวบอกสถานะให้เห็นในเมือง
      </Row>
      <Row label="ทำไมต้องสนใจ">
        เงินสดสำรองช่วยให้ไม่ต้องขายหุ้นตอนตลาดตก และมีเงินซื้อเพิ่มตอนหุ้นถูก แต่ถ้าถือเงินสดมากเกินไปนาน ๆ เงินก้อนนั้นจะไม่งอกเงย ตอนตลาดขึ้นจะตามดัชนีไม่ทัน
      </Row>
      <p className="mt-3 rounded-2xl bg-soft p-2.5 text-xs text-muted">
        {share >= 0.6
          ? 'ตอนนี้เงินสดเกินครึ่งพอร์ต ลองคลิกตึกบริษัทเพื่อดูข้อมูลแล้วเริ่มลงทุน'
          : share >= 0.1
            ? 'ตอนนี้มีเงินสดสำรองพอสมควร ✨'
            : 'ตอนนี้เงินสดเหลือน้อย ถ้าตลาดตกจะไม่มีกระสุนซื้อเพิ่ม'}
      </p>
    </>
  );
}

/** The plaza monument: the run's equal-weight city index, and how the player compares with it. */
function IndexInfo() {
  const view = useGame((s) => s.view);
  const run = useGame((s) => s.run);
  const equity = useGame((s) => s.equity);
  useGame((s) => s.day);
  if (!view || !run) return null;
  const now = view.indexBar()?.close ?? 1;
  const start = view.indexBar(run.windowStart)?.close ?? now;
  const indexRet = now / start - 1;
  const momentum = changeOver(view.indexCloses(view.currentDay - 25), 20) ?? 0;
  const last = equity[equity.length - 1];
  const invested = run.startingCash + equity.reduce((a, e) => a + e.contrib, 0);
  const myRet = last && invested > 0 ? last.value / invested - 1 : 0;
  const lead = myRet - indexRet;
  return (
    <>
      <Header icon="🗼" title="หอดัชนีเมือง" subtitle={`ดัชนีของบริษัททั้ง ${view.companies.length} แห่งในเมืองรอบนี้`} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-soft px-3 py-2">
          <div className="stat-label">ดัชนีตั้งแต่เริ่ม</div>
          <div className={`font-display font-semibold ${toneClass(indexRet)}`}>{pct(indexRet, 1)}</div>
        </div>
        <div className="rounded-2xl bg-soft px-3 py-2">
          <div className="stat-label">20 วันล่าสุด</div>
          <div className={`font-display font-semibold ${toneClass(momentum)}`}>{pct(momentum, 1)}</div>
        </div>
        <div className="rounded-2xl bg-soft px-3 py-2">
          <div className="stat-label">พอร์ตคุณ</div>
          <div className={`font-display font-semibold ${toneClass(myRet)}`}>{pct(myRet, 1)}</div>
        </div>
      </div>
      <Row label="หมายถึงอะไร">
        ผลตอบแทนถ้าแบ่งเงินซื้อทุกบริษัทในเมืองเท่า ๆ กันแล้วถือไว้ เป็นไม้บรรทัดวัดว่าการเลือกหุ้นของคุณดีกว่า &quot;ซื้อทั้งตลาด&quot; หรือไม่
      </Row>
      <Row label="ทำหน้าที่อะไร">
        หอสูงขึ้นหรือเตี้ยลงตามดัชนีเทียบวันเริ่มรอบ แถบไฟรอบหอสว่างเมื่อดัชนีขึ้นช่วง 20 วันล่าสุด และหรี่เมื่อดัชนีลง
      </Row>
      <p className={`mt-3 rounded-2xl bg-soft p-2.5 text-xs ${toneClass(lead)}`}>
        {Math.abs(lead) < 0.005 ? 'ตอนนี้พอร์ตคุณใกล้เคียงกับดัชนี' : lead > 0 ? `ตอนนี้คุณนำดัชนีอยู่ ${pct(lead, 1, false)} 🎉` : `ตอนนี้คุณตามหลังดัชนี ${pct(-lead, 1, false)}`}
      </p>
    </>
  );
}

function CivicInfo({ kind }: { kind: DecoKind }) {
  const d = decoDef(kind);
  if (!d) return null;
  return (
    <>
      <Header icon={d.icon} title={d.name} subtitle="อาคารพิเศษ · รางวัลจากการเรียนรู้" />
      <Row label="หมายถึงอะไร">{d.meaning}</Row>
      <Row label="ทำหน้าที่อะไร">{d.effect}</Row>
      {kind === 'garden' && <GardenNow />}
      <Row label="ได้มาจาก">{d.requiresText}</Row>
    </>
  );
}

/** Live dividend yield of the holdings, i.e. how far the garden is in bloom. */
function GardenNow() {
  const view = useGame((s) => s.view);
  const portfolio = useGame((s) => s.portfolio);
  useGame((s) => s.day);
  let invested = 0;
  let yieldSum = 0;
  if (view) {
    for (const h of Object.values(portfolio.holdings)) {
      const value = h.shares * (view.close(h.companyId) ?? 0);
      invested += value;
      yieldSum += value * (view.fundamentals(h.companyId)?.dividendYield ?? 0);
    }
  }
  const y = invested > 0 ? yieldSum / invested : 0;
  const bloom = Math.min(1, y / 0.03);
  return (
    <div className="mt-3 rounded-2xl bg-soft px-3 py-2">
      <div className="flex justify-between text-xs">
        <span className="text-muted">ปันผลเฉลี่ยของหุ้นที่ถือ</span>
        <b>{pct(y, 1, false)} ต่อปี</b>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-card-solid">
        <i className="block h-full rounded-full bg-[#ff8fb1]" style={{ width: `${bloom * 100}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted">
        {invested === 0 ? 'ยังไม่มีหุ้น ดอกไม้ยังตูมอยู่' : bloom >= 1 ? 'บานเต็มที่ 🌷 มีเหรียญทองบนต้นไม้' : `บานแล้ว ${Math.round(bloom * 100)}%`}
      </div>
    </div>
  );
}
