import { useMemo } from 'react';
import { achievementById } from '../data/achievements';
import { SECTORS } from '../data/sectors';
import { DECOS } from '../data/unlocks';
import { formatAnonDay } from '../engine/anonDate';
import { challengeLabels } from '../engine/challenges';
import { averageCost } from '../engine/portfolio';
import type { Grade } from '../engine/scoring';
import { baht, pct, price, signedBaht, thaiDate, toneClass } from '../lib/format';
import { revealedEvents, useGame } from '../store/gameStore';
import { CivicUnlocked } from './CivicUnlock';
import { EquityChart } from './EquityChart';
import type { ChartMarker } from './EquityChart';

const GRADE_COLOR: Record<Grade, string> = { 'A+': '#23a77a', A: '#4fb98e', B: '#7c6ce0', C: '#f2a03d', D: '#e07a56', F: '#e0566e' };

export function RevealScreen() {
  const view = useGame((s) => s.view)!;
  const run = useGame((s) => s.run)!;
  const portfolio = useGame((s) => s.portfolio);
  const runInfo = useGame((s) => s.runInfo);
  const report = useGame((s) => s.report);
  const decisions = useGame((s) => s.decisions);
  const dca = useGame((s) => s.dca);
  const failed = useGame((s) => s.challengeFailed);
  const newIds = useGame((s) => s.newAchievementIds);
  const mode = useGame((s) => s.mode);
  const backToMenu = useGame((s) => s.backToMenu);
  const real = runInfo?.real ?? false;
  const dateOf = (d: number) => (real ? thaiDate(view.dateOf(d)) : formatAnonDay(view.dateOf(d), view.windowStartDate));
  const events = revealedEvents();

  const rows = useMemo(
    () =>
      view.companies
        .map((c) => {
          const start = view.close(c.id, run.windowStart) ?? 0;
          const end = view.close(c.id) ?? 0;
          const txs = portfolio.transactions.filter((t) => t.companyId === c.id);
          const held = portfolio.holdings[c.id];
          const pnl = txs.length ? txs.reduce((a, t) => a + (t.side === 'sell' ? t.total : -t.total), 0) + (held ? held.shares * end : 0) : null;
          return { c, ret: start > 0 ? end / start - 1 : 0, pnl, trades: txs.length };
        })
        .sort((a, b) => b.ret - a.ret),
    [view, run, portfolio],
  );

  const markers = useMemo<ChartMarker[]>(
    () =>
      decisions.map((d, i) => ({
        day: d.day,
        text: `${i + 1}`,
        tone: d.chosenReturn >= d.bestReturn - 0.005 ? 'good' : d.chosenReturn < 0 ? 'bad' : 'neutral',
      })),
    [decisions],
  );

  if (!report) return null;
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const name = (id: string) => `${run.disguisedNames[id]} (${view.company(id)?.realName})`;

  return (
    <div className="pointer-events-auto absolute inset-0 overflow-y-auto bg-black/10 p-4">
      <div className="card pop-in mx-auto w-full max-w-3xl p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="stat-label">เฉลย! · {mode === 'sandbox' ? 'Sandbox' : 'Market Run'} · {run.funding?.mode === 'dca' ? 'ออมรายเดือน (DCA)' : 'เงินก้อนเดียว'}</div>
            <h1 className="font-display text-2xl font-semibold">
              {real ? `${thaiDate(view.windowStartDate)} – ${thaiDate(view.windowEndDate)}` : `ตลาดจำลอง · seed ${run.seed}`}
            </h1>
            <p className="text-xs text-muted">{runInfo?.detail}</p>
            {challengeLabels(run.modifiers).map((c) => (
              <span key={c} className="chip mr-1 mt-1 bg-[#fff1c7] text-[#9a6a00]">
                🛡️ {c}
              </span>
            ))}
          </div>
          <button className="btn-primary" onClick={backToMenu}>
            เล่นรอบใหม่
          </button>
        </div>

        {failed && <p className="mb-3 rounded-2xl bg-down/15 p-3 text-sm font-semibold text-down">❌ {failed}</p>}

        {/* Report card */}
        <section className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <div className="grid place-items-center rounded-3xl bg-soft p-3 text-center">
            <div className="stat-label">เกรดรวม</div>
            <div className="font-display text-6xl font-bold" style={{ color: GRADE_COLOR[report.grades.overall] }}>
              {report.grades.overall}
            </div>
            <div className="text-xs text-muted">{Math.round(report.scores.overall)}/100 คะแนน</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <GradeBox label="ผลตอบแทนเทียบดัชนี" grade={report.grades.returns} detail={`${pct(report.totalReturn, 1)} vs ดัชนี ${pct(report.indexReturn, 1)}`} />
            <GradeBox label="ความเสี่ยง (Sharpe / ขาดทุนสูงสุด)" grade={report.grades.risk} detail={`Sharpe ${report.sharpe.toFixed(2)} vs ${report.indexSharpe.toFixed(2)} · DD ${pct(-report.maxDrawdown, 0)}`} />
            <GradeBox label="กระจายความเสี่ยง" grade={report.grades.diversification} detail={`เฉลี่ย ${Math.round(report.avgDiversification * 100)}/100`} />
            <GradeBox label="พฤติกรรมและวินัย" grade={report.grades.behavior} detail={`${report.behaviorScore}/100 · ซื้อขาย ${report.trades} ครั้ง`} />
          </div>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="มูลค่าสุดท้าย" value={baht(report.finalValue)} sub={`${signedBaht(report.finalValue - report.contributed)}`} tone={report.totalReturn} />
          <Card label={run.funding?.mode === 'dca' ? 'เงินที่ลงไปทั้งหมด' : 'เงินทุน'} value={baht(report.contributed)} />
          {run.funding?.mode === 'dca' ? (
            <>
              <Card label="ผลตอบแทนแบบถ่วงเงิน (XIRR)" value={report.xirr == null ? '–' : `${pct(report.xirr, 1)}/ปี`} tone={report.xirr ?? 0} />
              <Card label="ผลตอบแทนแบบถ่วงเวลา (TWR)" value={pct(report.twr, 1)} tone={report.twr} />
            </>
          ) : (
            <>
              <Card label="ขาดทุนสูงสุดระหว่างทาง" value={pct(-report.maxDrawdown, 1)} sub={`ดัชนี ${pct(-report.indexMaxDrawdown, 1)}`} tone={-report.maxDrawdown} />
              <Card label="ค่าธรรมเนียมรวม" value={baht(portfolio.feesPaid)} sub={`${report.trades} รายการ`} />
            </>
          )}
        </div>

        <section className="mt-3 rounded-2xl bg-soft p-3">
          <h2 className="mb-1 text-sm font-semibold">💡 คำแนะนำสำหรับคุณ</h2>
          <ul className="space-y-1 text-sm">
            {report.tips.map((t) => (
              <li key={t}>• {t}</li>
            ))}
          </ul>
        </section>

        {newIds.length > 0 && (
          <section className="mt-3">
            <h2 className="mb-1 text-sm font-semibold">🏅 ความสำเร็จใหม่</h2>
            <div className="flex flex-wrap gap-2">
              {newIds.map((id) => {
                const a = achievementById(id);
                return a ? (
                  <div key={id} className="pop-in flex items-center gap-2 rounded-2xl bg-accent-soft px-3 py-2 text-sm">
                    <span className="text-2xl">{a.icon}</span>
                    <div>
                      <div className="font-semibold">{a.title}</div>
                      <div className="text-xs text-muted">{a.desc}</div>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </section>
        )}

        <CivicUnlocked defs={DECOS.filter((c) => c.requires.achievement && newIds.includes(c.requires.achievement))} />

        <section className="mt-4">
          <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-muted">
            <span>— พอร์ต</span>
            <span>— ดัชนีเมือง (เงินเท่ากัน)</span>
            {run.funding?.mode === 'dca' && <span>-- เงินที่ลงไป</span>}
            {decisions.length > 0 && <span>● = จุดตัดสินใจ (เลข = ลำดับด้านล่าง)</span>}
          </div>
          <EquityChart height={190} reveal={real} markers={markers} showContrib={run.funding?.mode === 'dca'} />
        </section>

        {events.length > 0 && (
          <section className="mt-4 space-y-2">
            <h2 className="text-sm font-semibold">📰 เหตุการณ์จริงที่ซ่อนอยู่ในรอบนี้</h2>
            {events.map((e) => (
              <div key={e.id} className="rounded-2xl border border-line p-3 text-sm">
                <div className="font-semibold">{e.name}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{e.lesson}</p>
              </div>
            ))}
          </section>
        )}

        {dca && <DcaSection />}

        {(report.panicSells.length > 0 || report.fomoBuys.length > 0) && (
          <section className="mt-4">
            <h2 className="mb-1 text-sm font-semibold">🧠 จังหวะที่อารมณ์อาจนำการตัดสินใจ</h2>
            <ul className="space-y-1 text-xs">
              {report.panicSells.map((f) => (
                <li key={`p${f.day}${f.companyId}`} className="rounded-xl bg-soft px-3 py-1.5">
                  {dateOf(f.day)} · ขาย {name(f.companyId)} ใกล้จุดต่ำสุด หลังจากนั้นราคาเด้งขึ้น <b className="text-up">{pct(f.move, 1)}</b>
                </li>
              ))}
              {report.fomoBuys.map((f) => (
                <li key={`f${f.day}${f.companyId}`} className="rounded-xl bg-soft px-3 py-1.5">
                  {dateOf(f.day)} · ไล่ซื้อ {name(f.companyId)} หลังวิ่งแรง หลังจากนั้นราคาย่อลง <b className="text-down">{pct(f.move, 1)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}

        {decisions.length > 0 && (
          <section className="mt-4">
            <h2 className="mb-2 text-sm font-semibold">การตัดสินใจสำคัญ ({decisions.length} ครั้ง)</h2>
            <ul className="space-y-1 text-xs">
              {decisions.map((d, i) => (
                <li key={d.day + d.title} className="flex flex-wrap items-center gap-x-2 rounded-xl bg-soft px-3 py-1.5">
                  <b className="text-accent">{i + 1}</b>
                  <span className="text-muted">{dateOf(d.day)}</span>
                  <span className="flex-1 font-semibold">{d.title}</span>
                  <span>
                    เลือก "{d.chosenLabel}" <b className={toneClass(d.chosenReturn)}>{pct(d.chosenReturn, 1)}</b>
                  </span>
                  {d.bestLabel !== d.chosenLabel && (
                    <span className="text-muted">
                      ดีที่สุด: "{d.bestLabel}" {pct(d.bestReturn, 1)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold">ตัวจริงของบริษัทในเมือง</h2>
          <div className="scroll-thin max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card-solid text-muted">
                <tr>
                  <th className="py-1 text-left font-medium">ชื่อในเกม</th>
                  <th className="py-1 text-left font-medium">ตัวจริง</th>
                  <th className="py-1 text-right font-medium">ราคาเปลี่ยนแปลงทั้งรอบ</th>
                  <th className="py-1 text-right font-medium">กำไร/ขาดทุนของคุณ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, ret, pnl, trades }) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-1.5">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: SECTORS[c.sector].color }} />
                      {run.disguisedNames[c.id]}
                    </td>
                    <td className="py-1.5">
                      <div className="font-semibold">
                        {c.realName} {real && <span className="text-muted">({c.ticker})</span>}
                      </div>
                      <div className="text-muted">{c.description}</div>
                    </td>
                    <td className={`py-1.5 text-right font-semibold ${toneClass(ret)}`}>{pct(ret, 1)}</td>
                    <td className={`py-1.5 text-right ${pnl == null ? 'text-muted' : toneClass(pnl)}`}>{pnl == null ? '—' : `${signedBaht(pnl)} · ${trades} ครั้ง`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            ดาวเด่นของรอบนี้คือ <b className="text-ink">{best.c.realName}</b> ({pct(best.ret, 1)}) ส่วนตัวที่แย่ที่สุดคือ <b className="text-ink">{worst.c.realName}</b> (
            {pct(worst.ret, 1)}) นี่คือเหตุผลที่การกระจายความเสี่ยงสำคัญ เพราะเราไม่มีทางรู้ล่วงหน้าว่าตัวไหนจะเป็นดาวเด่น
          </p>
        </section>
      </div>
    </div>
  );
}

/** DCA-specific: average cost per holding and the effect of investing during drops vs pausing. */
function DcaSection() {
  const view = useGame((s) => s.view)!;
  const run = useGame((s) => s.run)!;
  const dca = useGame((s) => s.dca)!;
  const portfolio = useGame((s) => s.portfolio);
  const idxNow = view.indexBar()?.close ?? 1;
  const growth = (day: number) => idxNow / (view.indexBar(day)?.close ?? idxNow);
  const dropAmount = dca.dropInvested.reduce((a, d) => a + d.amount, 0);
  const dropNow = dca.dropInvested.reduce((a, d) => a + d.amount * growth(d.day), 0);
  const skippedNow = dca.skippedDays.reduce((a, d) => a + dca.monthly * growth(d), 0);
  const holdings = Object.values(portfolio.holdings);

  return (
    <section className="mt-4 space-y-2">
      <h2 className="text-sm font-semibold">📅 สรุปการออมรายเดือน</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-soft p-3 text-xs leading-relaxed">
          <div className="font-semibold">ลงทุนช่วงตลาดลง</div>
          {dca.dropInvested.length ? (
            <>
              คุณลงทุนต่อในเดือนที่ตลาดลงเกิน 10% รวม {dca.dropInvested.length} ครั้ง ({baht(dropAmount)}) ถ้าคิดตามดัชนีเมือง เงินก้อนนั้นตอนนี้เป็น{' '}
              <b className={toneClass(dropNow - dropAmount)}>{baht(dropNow)}</b> ({pct(dropNow / dropAmount - 1, 1)})
            </>
          ) : (
            'รอบนี้ไม่ได้ลงทุนในเดือนที่ตลาดลงแรง (หรือตลาดไม่ได้ลงแรงเลย)'
          )}
        </div>
        <div className="rounded-2xl bg-soft p-3 text-xs leading-relaxed">
          <div className="font-semibold">เดือนที่ข้าม</div>
          {dca.skippedDays.length ? (
            <>
              คุณข้ามการลงทุน {dca.skippedDays.length} เดือน ถ้าเงิน {baht(dca.monthly * dca.skippedDays.length)} นั้นลงทุนตามดัชนีเมือง ตอนนี้จะเป็นราว{' '}
              <b>{baht(skippedNow)}</b>
            </>
          ) : (
            'ไม่ได้ข้ามการลงทุนเลยสักเดือน เยี่ยมมาก! ความสม่ำเสมอคือหัวใจของ DCA'
          )}
        </div>
      </div>
      {holdings.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-muted">
            <tr>
              <th className="text-left font-medium">หุ้นที่ถือ</th>
              <th className="text-right font-medium">ต้นทุนเฉลี่ย</th>
              <th className="text-right font-medium">ราคาสุดท้าย</th>
              <th className="text-right font-medium">กำไร/ขาดทุน</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const px = view.close(h.companyId) ?? 0;
              const r = px / averageCost(h) - 1;
              return (
                <tr key={h.companyId} className="border-t border-line">
                  <td className="py-1">{run.disguisedNames[h.companyId]}</td>
                  <td className="py-1 text-right">{price(averageCost(h))}</td>
                  <td className="py-1 text-right">{price(px)}</td>
                  <td className={`py-1 text-right ${toneClass(r)}`}>{pct(r, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function GradeBox({ label, grade, detail }: { label: string; grade: Grade; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-soft px-3 py-2">
      <div className="font-display text-2xl font-bold" style={{ color: GRADE_COLOR[grade] }}>
        {grade}
      </div>
      <div className="min-w-0">
        <div className="stat-label">{label}</div>
        <div className="truncate text-xs">{detail}</div>
      </div>
    </div>
  );
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number }) {
  return (
    <div className="rounded-2xl bg-soft px-3 py-2">
      <div className="stat-label">{label}</div>
      <div className={`font-display text-lg font-semibold ${tone !== undefined ? toneClass(tone) : ''}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
