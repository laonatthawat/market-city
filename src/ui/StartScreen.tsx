import { useState } from 'react';
import type { ReactNode } from 'react';
import { ACHIEVEMENTS } from '../data/achievements';
import { DECOS } from '../data/unlocks';
import { CHAPTERS } from '../data/tutorials';
import { CHALLENGES } from '../engine/challenges';
import { randomSeed } from '../engine/rng';
import type { RunModifiers } from '../engine/types';
import { baht, pct, thaiDate, toneClass } from '../lib/format';
import { useGame } from '../store/gameStore';
import { CivicList } from './CivicUnlock';
import { SettingsButton } from './Settings';

type Tab = 'learn' | 'run' | 'sandbox' | 'stats';

const CASH_PRESETS = [100_000, 500_000, 1_000_000, 5_000_000];
const MONTHLY_PRESETS = [3_000, 5_000, 10_000, 20_000];
const SHOCK_LEVELS = [
  { v: 0, label: 'ไม่มี' },
  { v: 1, label: 'น้อย' },
  { v: 2, label: 'ปานกลาง' },
  { v: 4, label: 'บ่อย' },
];

/** "#sandbox=<seed>-<shocks>" lets friends play the same generated market. */
function readSandboxHash(): { seed: number; shocks: number } | null {
  const m = /#sandbox=(\d+)-(\d+)/.exec(globalThis.location?.hash ?? '');
  return m ? { seed: Number(m[1]) >>> 0, shocks: Number(m[2]) } : null;
}

export function StartScreen() {
  const progress = useGame((s) => s.progress);
  const lastMode = useGame((s) => s.mode);
  const error = useGame((s) => s.error);
  const shared = readSandboxHash();
  // Coming back from a chapter lands on the chapter list; shared sandbox links open the sandbox.
  const [tab, setTab] = useState<Tab>(() =>
    shared ? 'sandbox' : lastMode === 'tutorial' || progress.chapters.length === 0 ? 'learn' : lastMode === 'sandbox' ? 'sandbox' : 'run',
  );

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center overflow-y-auto p-4">
      <div className="card pop-in w-full max-w-xl p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-2xl text-white">🏙️</div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Market City</h1>
            <p className="text-sm text-muted">เมืองจำลองสำหรับฝึกลงทุนด้วยข้อมูลตลาดในอดีต</p>
          </div>
          <div className="ml-auto">
            <SettingsButton />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-4 rounded-2xl bg-soft p-0.5">
          {(
            [
              ['learn', '🎓 บทเรียน'],
              ['run', '🎯 Market Run'],
              ['sandbox', '🧪 Sandbox'],
              ['stats', '🏆 สถิติ'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={`tab !px-1 text-xs sm:text-sm ${tab === id ? 'tab-active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'learn' && <ChapterList />}
        {tab === 'run' && <RunSetup sandbox={false} />}
        {tab === 'sandbox' && <RunSetup sandbox shared={shared} />}
        {tab === 'stats' && <Stats />}
        {error && <p className="mt-3 rounded-2xl bg-accent-soft p-3 text-sm text-down">{error}</p>}
      </div>
    </div>
  );
}

function Choice<T extends string | number>({ value, current, onPick, children }: { value: T; current: T; onPick: (v: T) => void; children: ReactNode }) {
  return (
    <button className={`btn-soft !px-1 ${value === current ? '!bg-accent !text-white' : ''}`} onClick={() => onPick(value)}>
      {children}
    </button>
  );
}

function RunSetup({ sandbox, shared }: { sandbox: boolean; shared?: { seed: number; shocks: number } | null }) {
  const startRun = useGame((s) => s.startRun);
  const startSandbox = useGame((s) => s.startSandbox);
  const dataset = useGame((s) => s.dataset);
  const showToast = useGame((s) => s.showToast);
  const [funding, setFunding] = useState<'lump' | 'dca'>('lump');
  const [cash, setCash] = useState(1_000_000);
  const [custom, setCustom] = useState('');
  const [monthly, setMonthly] = useState(10_000);
  const [monthlyCustom, setMonthlyCustom] = useState('');
  const [dcaStart, setDcaStart] = useState('10000');
  const [years, setYears] = useState(2);
  const [dcaYears, setDcaYears] = useState(5);
  const [challenges, setChallenges] = useState<string[]>([]);
  const [seedText, setSeedText] = useState(shared ? String(shared.seed) : '');
  const [shocks, setShocks] = useState(shared?.shocks ?? 2);

  const forcedDca = challenges.includes('dcaonly');
  const mode = forcedDca ? 'dca' : funding;
  const lumpCash = custom && Number(custom) >= 10_000 ? Number(custom) : cash;
  const monthlyValue = monthlyCustom && Number(monthlyCustom) >= 500 ? Number(monthlyCustom) : monthly;
  const startingCash = mode === 'dca' ? Number(dcaStart) || 0 : lumpCash;
  const runYears = mode === 'dca' ? dcaYears : years;
  const minutes = Math.round(mode === 'dca' ? runYears * 3.4 : runYears * 12.6);
  const modifiers: RunModifiers = Object.assign({}, ...CHALLENGES.filter((c) => challenges.includes(c.id)).map((c) => c.mods));

  const start = () => {
    const settings = {
      startingCash,
      years: runYears,
      funding: { mode, monthly: mode === 'dca' ? monthlyValue : 0 },
      modifiers,
    };
    if (sandbox) {
      const seed = seedText ? Number(seedText) >>> 0 : randomSeed();
      setSeedText(String(seed));
      void startSandbox({ ...settings, seed, shocksPerYear: shocks });
    } else {
      void startRun({ ...settings, seed: seedText ? Number(seedText) >>> 0 : undefined });
    }
  };

  const copyLink = () => {
    const seed = seedText ? Number(seedText) >>> 0 : randomSeed();
    setSeedText(String(seed));
    const url = `${location.origin}${location.pathname}#sandbox=${seed}-${shocks}`;
    navigator.clipboard?.writeText(url).then(
      () => showToast('คัดลอกลิงก์แล้ว ส่งให้เพื่อนเล่นตลาดเดียวกันได้เลย', 'good'),
      () => showToast(url, 'info'),
    );
  };

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-soft p-3 text-sm">
        {sandbox ? (
          <>
            <div className="font-semibold">🧪 Sandbox · ตลาดจำลองแบบสุ่ม</div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              ตลาดจากโมเดลสุ่มที่มีขาขึ้น ขาลง และวิกฤตสมมติ (ตลาดถล่ม เซกเตอร์บูม เรื่องอื้อฉาว ดอกเบี้ยช็อก) ซึ่งเกิดเฉพาะในโหมดนี้
              ใช้ seed เดียวกันจะได้ตลาดเหมือนกันทุกครั้ง แชร์ให้เพื่อนแข่งกันได้
            </p>
          </>
        ) : (
          <>
            <div className="font-semibold">🎯 Market Run · ช่วงเวลาจริงในอดีต</div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              สุ่มช่วงเวลาจริงกับบริษัท 15–20 แห่ง โดยปิดชื่อบริษัทและวันที่ไว้จนจบรอบ บางรอบอาจมีเหตุการณ์สำคัญทางประวัติศาสตร์ซ่อนอยู่
            </p>
            <p className="mt-1.5 text-[11px] text-muted">ชุดข้อมูล: {dataset?.label ?? 'กำลังโหลด…'}</p>
          </>
        )}
      </div>

      <fieldset className="mb-3">
        <legend className="stat-label mb-1.5">รูปแบบการลงทุน</legend>
        <div className="grid grid-cols-2 gap-2">
          <button className={`btn-soft ${mode === 'lump' ? '!bg-accent !text-white' : ''}`} disabled={forcedDca} onClick={() => setFunding('lump')}>
            💵 เงินก้อนเดียว
          </button>
          <button className={`btn-soft ${mode === 'dca' ? '!bg-accent !text-white' : ''}`} onClick={() => setFunding('dca')}>
            📅 ออมรายเดือน (DCA)
          </button>
        </div>
      </fieldset>

      {mode === 'lump' ? (
        <>
          <fieldset className="mb-3">
            <legend className="stat-label mb-1.5">เงินทุนเริ่มต้น</legend>
            <div className="grid grid-cols-4 gap-2">
              {CASH_PRESETS.map((c) => (
                <Choice key={c} value={c} current={custom ? -1 : cash} onPick={(v) => (setCash(v), setCustom(''))}>
                  {c >= 1e6 ? `${c / 1e6} ล้าน` : `${c / 1e3}k`}
                </Choice>
              ))}
            </div>
            <input className="input mt-2" inputMode="numeric" placeholder="กำหนดเอง (ขั้นต่ำ 10,000 บาท)" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))} />
          </fieldset>
          <fieldset className="mb-3">
            <legend className="stat-label mb-1.5">ระยะเวลา</legend>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((y) => (
                <Choice key={y} value={y} current={years} onPick={setYears}>
                  {y} ปี
                </Choice>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <>
          <fieldset className="mb-3">
            <legend className="stat-label mb-1.5">เงินลงทุนต่อเดือน</legend>
            <div className="grid grid-cols-4 gap-2">
              {MONTHLY_PRESETS.map((m) => (
                <Choice key={m} value={m} current={monthlyCustom ? -1 : monthly} onPick={(v) => (setMonthly(v), setMonthlyCustom(''))}>
                  {(m / 1000).toLocaleString('th-TH')}k
                </Choice>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="stat-label">
                ต่อเดือน (กำหนดเอง)
                <input className="input mt-0.5" inputMode="numeric" placeholder="เช่น 7,000" value={monthlyCustom} onChange={(e) => setMonthlyCustom(e.target.value.replace(/[^\d]/g, ''))} />
              </label>
              <label className="stat-label">
                เงินตั้งต้น (บาท)
                <input className="input mt-0.5" inputMode="numeric" placeholder="0" value={dcaStart} onChange={(e) => setDcaStart(e.target.value.replace(/[^\d]/g, ''))} />
              </label>
            </div>
          </fieldset>
          <fieldset className="mb-3">
            <legend className="stat-label mb-1.5">ระยะเวลา</legend>
            <div className="grid grid-cols-3 gap-2">
              {[3, 4, 5].map((y) => (
                <Choice key={y} value={y} current={dcaYears} onPick={setDcaYears}>
                  {y} ปี
                </Choice>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {sandbox && (
        <fieldset className="mb-3">
          <legend className="stat-label mb-1.5">ความถี่ของวิกฤตสมมติ (ต่อปี)</legend>
          <div className="grid grid-cols-4 gap-2">
            {SHOCK_LEVELS.map((l) => (
              <Choice key={l.v} value={l.v} current={shocks} onPick={setShocks}>
                {l.label}
              </Choice>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input" inputMode="numeric" placeholder="Seed (เว้นว่าง = สุ่ม)" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/[^\d]/g, ''))} />
            <button className="btn-soft shrink-0" onClick={() => setSeedText(String(randomSeed()))} title="สุ่ม seed">
              🎲
            </button>
            <button className="btn-soft shrink-0" onClick={copyLink}>
              🔗 แชร์
            </button>
          </div>
        </fieldset>
      )}

      <fieldset className="mb-3">
        <legend className="stat-label mb-1.5">โหมดท้าทาย (เลือกได้หลายข้อ · มีสถิติแยก)</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {CHALLENGES.map((c) => {
            const on = challenges.includes(c.id);
            return (
              <button
                key={c.id}
                title={c.detail}
                className={`rounded-2xl border-2 px-2.5 py-1.5 text-left text-xs transition ${on ? 'border-accent bg-accent-soft' : 'border-line bg-card-solid'}`}
                onClick={() => setChallenges(on ? challenges.filter((x) => x !== c.id) : [...challenges, c.id])}
              >
                <div className="font-semibold">🛡️ {c.label}</div>
                <div className="text-muted">{c.detail}</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {!sandbox && (
        <details className="mb-3 text-sm">
          <summary className="cursor-pointer text-muted">ตั้งค่าเพิ่มเติม</summary>
          <input className="input mt-2" inputMode="numeric" placeholder="Seed (เว้นว่างไว้ = สุ่ม)" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/[^\d]/g, ''))} />
        </details>
      )}

      <button className="btn-primary w-full !py-3 text-base" disabled={!dataset} onClick={start}>
        เริ่มเล่น · {mode === 'dca' ? `เดือนละ ${baht(monthlyValue)} · ${runYears} ปี` : `${baht(lumpCash)} · ${runYears} ปี`}
      </button>
      <p className="mt-1.5 text-center text-[11px] text-muted">ที่ความเร็ว 1x ใช้เวลาราว {minutes} นาที (เร่งเป็น 5x หรือ 20x ได้)</p>
    </div>
  );
}

function ChapterList() {
  const progress = useGame((s) => s.progress);
  const startChapter = useGame((s) => s.startChapter);
  const dataset = useGame((s) => s.dataset);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        แต่ละบทใช้เวลาราว 3–5 นาที ใช้ข้อมูลตลาดช่วงที่คัดมาแล้ว และจบด้วยการตัดสินใจที่คุณต้องเลือกเอง · เรียนแล้ว {progress.chapters.length}/{CHAPTERS.length} บท
        {dataset && !dataset.real && ' (ตอนนี้ใช้ตลาดจำลอง ตัวเลขจะต่างจากเหตุการณ์จริง)'}
      </p>
      <div className="scroll-thin max-h-[52vh] space-y-2 overflow-y-auto pr-1">
        {CHAPTERS.map((c) => {
          const done = progress.chapters.includes(c.id);
          return (
            <button
              key={c.id}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card-solid p-3 text-left transition hover:border-accent"
              onClick={() => startChapter(c.id)}
              disabled={!dataset}
            >
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl font-display font-semibold ${done ? 'bg-up text-white' : 'bg-soft'}`}>{done ? '✓' : c.number}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.title}</div>
                <div className="truncate text-xs text-muted">{c.concept}</div>
              </div>
              <span className="text-accent">▶</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Badges; tap one to see what it takes to earn it. */
function AchievementGrid() {
  const achievements = useGame((s) => s.achievements);
  const chapters = useGame((s) => s.progress.chapters.length);
  const [open, setOpen] = useState<string | null>(null);
  const a = open ? ACHIEVEMENTS.find((x) => x.id === open) : undefined;
  const got = a ? achievements.includes(a.id) : false;
  const reward = a ? DECOS.find((d) => d.requires.achievement === a.id) : undefined;
  const progress = a?.id === 'scholar_3' ? `${Math.min(chapters, 3)}/3 บท` : a?.id === 'scholar_8' ? `${chapters}/8 บท` : null;
  return (
    <section>
      <h2 className="stat-label mb-1.5">
        ความสำเร็จ ({achievements.length}/{ACHIEVEMENTS.length}) · กดดูวิธีได้
      </h2>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {ACHIEVEMENTS.map((x) => {
          const have = achievements.includes(x.id);
          return (
            <button
              key={x.id}
              onClick={() => setOpen(open === x.id ? null : x.id)}
              className={`rounded-2xl border-2 p-2 text-center transition hover:brightness-95 ${open === x.id ? 'border-accent' : 'border-transparent'} ${
                have ? 'bg-accent-soft' : 'bg-soft'
              }`}
            >
              <div className={`text-2xl ${have ? '' : 'opacity-50'}`}>{have ? x.icon : '🔒'}</div>
              <div className={`truncate text-[11px] font-semibold ${have ? '' : 'opacity-60'}`}>{x.title}</div>
            </button>
          );
        })}
      </div>
      {a && (
        <div className="pop-in mt-2 rounded-2xl border border-line bg-card-solid p-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{a.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{a.title}</div>
              <div className="text-xs text-muted">{a.desc}</div>
            </div>
            <span className={`chip shrink-0 ${got ? 'bg-up/15 text-up' : 'bg-soft text-muted'}`}>{got ? '✓ ได้แล้ว' : progress ? `🔒 ${progress}` : '🔒 ยังไม่ได้'}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">
            <b>วิธีทำ:</b> {a.hint}
          </p>
          {reward && (
            <p className="mt-1.5 text-xs text-muted">
              รางวัล: ปลดล็อก {reward.icon} {reward.name} ในเมือง
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const MODE_LABEL: Record<string, string> = { run: 'Market Run', sandbox: 'Sandbox' };

function Stats() {
  const bests = useGame((s) => s.bests);
  const history = useGame((s) => s.history);
  return (
    <div className="space-y-4">
      <AchievementGrid />

      <CivicList />

      <section>
        <h2 className="stat-label mb-1.5">สถิติดีที่สุด (แยกตามโหมดและการท้าทาย)</h2>
        {Object.keys(bests).length === 0 ? (
          <p className="text-xs text-muted">ยังไม่มี เล่นจนจบสักรอบเพื่อบันทึกสถิติ</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {Object.entries(bests).map(([key, b]) => {
              const [mode, funding, challenge] = key.split('|');
              return (
                <li key={key} className="flex items-center gap-2 rounded-xl bg-soft px-3 py-1.5">
                  <span className="font-display text-base font-semibold text-accent">{b.grade}</span>
                  <span className="flex-1">
                    {MODE_LABEL[mode] ?? mode} · {funding === 'dca' ? 'DCA' : 'เงินก้อน'}
                    {challenge !== 'none' && ` · 🛡️ ${challenge}`}
                  </span>
                  <span>คะแนน {b.score}</span>
                  <span className={toneClass(b.excess)}>{pct(b.excess, 1)} เทียบดัชนี</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="stat-label mb-1.5">ประวัติการเล่น</h2>
        {history.length === 0 ? (
          <p className="text-xs text-muted">ยังไม่มีประวัติ</p>
        ) : (
          <ul className="scroll-thin max-h-40 space-y-1 overflow-y-auto text-xs">
            {history.map((h) => (
              <li key={h.id + h.playedAt} className="flex items-center gap-2 rounded-xl bg-soft px-3 py-1.5">
                <span className="text-muted">{thaiDate(h.playedAt.slice(0, 10))}</span>
                {h.grade && <b className="text-accent">{h.grade}</b>}
                <span className="flex-1 truncate">
                  {MODE_LABEL[h.mode ?? 'run']} · {h.funding === 'dca' ? 'DCA' : baht(h.startingCash)} · {h.years} ปี{h.failed ? ' · ❌ ภารกิจล้มเหลว' : ''}
                </span>
                <span className={toneClass(h.totalReturn)}>{pct(h.totalReturn, 1)}</span>
                <span className="text-muted">ดัชนี {pct(h.indexReturn, 1)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
