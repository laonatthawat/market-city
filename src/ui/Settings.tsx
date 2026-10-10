import { useState } from 'react';
import { createPortal } from 'react-dom';
import { WEATHER_LABEL } from '../engine/weather';
import type { Weather } from '../engine/weather';
import { useGame } from '../store/gameStore';

/** ⚙️ popover: theme, sound effects, music, graphics quality and the city legend. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [legend, setLegend] = useState(false);
  const theme = useGame((s) => s.theme);
  const sound = useGame((s) => s.sound);
  const music = useGame((s) => s.music);
  const graphics = useGame((s) => s.graphics);
  const toggleTheme = useGame((s) => s.toggleTheme);
  const toggleSound = useGame((s) => s.toggleSound);
  const toggleMusic = useGame((s) => s.toggleMusic);
  const setGraphics = useGame((s) => s.setGraphics);

  return (
    <div className="relative">
      <button className="btn-soft h-9 w-9 !p-0" onClick={() => setOpen(!open)} data-tip="ตั้งค่า" data-tip-end="" aria-label="ตั้งค่า">
        ⚙️
      </button>
      {open && (
        <div className="card pop-in absolute right-0 top-11 z-30 w-60 space-y-1 p-2 text-sm">
          <Row label="ธีม" value={theme === 'dark' ? '🌙 กลางคืน' : '☀️ กลางวัน'} onClick={toggleTheme} />
          <Row label="เสียงเอฟเฟกต์" value={sound ? '🔊 เปิด' : '🔇 ปิด'} onClick={toggleSound} />
          <Row label="เพลงพื้นหลัง" value={music ? '🎵 เปิด' : '🔇 ปิด'} onClick={toggleMusic} />
          <Row
            label="กราฟิก"
            value={graphics === 'high' ? '✨ สวยงาม' : '⚡ ประหยัด'}
            onClick={() => setGraphics(graphics === 'high' ? 'low' : 'high')}
          />
          <button
            className="btn-soft w-full !justify-start text-xs"
            onClick={() => {
              setLegend(true);
              setOpen(false);
            }}
          >
            ❓ วิธีอ่านเมือง
          </button>
        </div>
      )}
      {legend && <LegendModal onClose={() => setLegend(false)} />}
    </div>
  );
}

const HOW_TO: [string, string][] = [
  ['▶ ให้เวลาเดิน', 'กด ▶ (หรือ Space) แล้วเลือกความเร็ว 1x / 5x / 20x ตึกจะสูงต่ำตามราคาหุ้นทุกวัน'],
  ['🏢 คลิกตึกเพื่อดูบริษัท', 'ดูกราฟราคา งบการเงิน คะแนนสุขภาพ แล้วกดซื้อ/ขายได้ในแผงด้านขวา'],
  ['📊 ดูพอร์ตทางซ้าย', 'เทียบผลตอบแทนกับดัชนีเมือง (ซื้อทุกบริษัทเท่า ๆ กัน) และดูว่ากระจายความเสี่ยงพอไหม'],
  ['🏁 จบรอบเพื่อเฉลย', 'ระบบเฉลยชื่อบริษัทจริง ช่วงเวลาจริง และให้เกรดการลงทุนของคุณ'],
];

const SHORTCUTS: [string, string][] = [
  ['Space', 'หยุด / เล่น'],
  ['1 · 2 · 3', 'ความเร็ว 1x · 5x · 20x'],
  ['Esc', 'ปิดแผงข้อมูลบริษัท'],
  ['Home', 'กลับมุมกล้องเริ่มต้น'],
  ['ลากเมาส์ซ้าย', 'หมุนกล้อง'],
  ['ลากเมาส์ขวา', 'เลื่อนกล้อง'],
  ['ล้อเมาส์', 'ซูมเข้า/ออก'],
];

/** ❔ quick guide: how to play, keyboard and camera controls, and a link to the city legend. */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [legend, setLegend] = useState(false);
  return (
    <>
      <button className="btn-soft h-9 w-9 !p-0 font-display text-base font-bold text-accent" onClick={() => setOpen(true)} data-tip="วิธีเล่นและปุ่มลัด" data-tip-end="" aria-label="วิธีเล่น">
        ?
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4" onClick={() => setOpen(false)}>
            <div className="card pop-in max-h-[90vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-3 font-display text-lg font-semibold">วิธีเล่น</h2>
              <ol className="space-y-2">
                {HOW_TO.map(([k, v], i) => (
                  <li key={k} className="flex gap-3 rounded-2xl bg-soft p-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
                    <div>
                      <div className="text-sm font-semibold">{k}</div>
                      <div className="text-xs text-muted">{v}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <h3 className="mb-1.5 mt-4 text-sm font-semibold">ปุ่มลัดและการควบคุมกล้อง</h3>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 rounded-xl bg-soft px-2.5 py-1.5">
                    <kbd className="rounded-md border border-line bg-card-solid px-1.5 py-0.5 font-sans text-[11px] font-semibold">{k}</kbd>
                    <span className="text-muted">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className="btn-soft flex-1"
                  onClick={() => {
                    setOpen(false);
                    setLegend(true);
                  }}
                >
                  🗺️ วิธีอ่านเมือง
                </button>
                <button className="btn-primary flex-1" onClick={() => setOpen(false)}>
                  เข้าใจแล้ว
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {legend && <LegendModal onClose={() => setLegend(false)} />}
    </>
  );
}

function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left hover:bg-soft" onClick={onClick}>
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </button>
  );
}

const ARCHITECTURE: [string, string][] = [
  ['💻 เทคโนโลยี', 'ตึกกระจกเรียวสูง ไฟ LED สีฟ้ารอบยอด จานดาวเทียม'],
  ['🏦 การเงิน', 'ตึกขั้นบันได โดมสีทอง เสาโรมันหน้าทางเข้า'],
  ['⚡ พลังงาน', 'ปล่องควันลายแดงขาว กังหันลม แผงโซลาร์'],
  ['🛍️ สินค้าอุปโภค', 'ป้ายโฆษณาบนหลังคา กันสาดลายทางรอบชั้นล่าง'],
  ['🏥 สุขภาพ', 'ป้ายกากบาทสีเขียว ลานจอด ฮ. ตัว H'],
  ['🏭 อุตสาหกรรม', 'เครนก่อสร้างสีเหลือง หลังคาฟันเลื่อย หน้าต่างแถบยาว'],
  ['🏠 อสังหาฯ', 'ระเบียงทุก 2 ชั้น สวนบนดาดฟ้า'],
];

const LEGEND: [string, string][] = [
  ['🏢 ความสูงของตึก', 'มูลค่าตลาดของบริษัท (ยิ่งสูงยิ่งใหญ่)'],
  ['↔️ ความกว้างของตึก', 'รายได้ของบริษัท'],
  ['💡 ไฟหน้าต่าง', 'สว่าง = ราคาขึ้นช่วง 20 วัน · หรี่ = ราคาลง · กะพริบ = ขึ้น/ลงแรงในวันเดียว'],
  ['🎨 สีตึก', 'ฟ้า = P/E ต่ำ (ถูก) · ครีม = ปานกลาง · ส้ม = P/E สูง (แพง) · เทา = ขาดทุน'],
  ['🏗️ นั่งร้านสีส้ม', 'หนี้สูง หรือกำไรต่อหุ้นลดลงเกิน 10%'],
  ['🚩 ธงชมพู', 'หุ้นที่คุณถืออยู่'],
  ['🗼 หอกลางเมือง', 'ดัชนีเมือง เทียบกับวันเริ่มรอบ · คลิกเพื่อดูว่าคุณนำหรือตามดัชนี'],
  ['🏦 ธนาคารสำรอง', 'ขนาดตามสัดส่วนเงินสดในพอร์ต · โดมเรืองแสงเมื่อมีเงินสด ≥10% · คลิกเพื่อดูรายละเอียด'],
  ['🏛️ อาคารพิเศษ', 'ห้องสมุด ประภาคาร หอดูดาว ฯลฯ ปรากฏในเมืองเมื่อเรียนจบบทหรือได้ความสำเร็จ · คลิกเพื่อดูความหมาย'],
  ['🎯 กลับมุมเริ่มต้น', 'ปุ่มมุมซ้ายล่าง (หรือกด Home) โผล่มาเมื่อเลื่อนกล้องออกจากมุมแรก'],
  ['🚗🚶 รถและคน', 'เมืองคึกคักเมื่อตลาดดี เงียบเหงาเมื่อตลาดแย่ · รถหยุดรอไฟแดงที่ทุกแยก'],
  ['🚶 ทางเดินเชื่อมเมือง', 'ลานกลาง → ทางเดินในสวนกลางเมือง → ทางม้าลายข้ามถนนวงแหวน (ข้ามตอนไฟแดง) → ถนนคนเดินเข้าย่าน → ทางเดินรอบย่าน → ทางเดินเลียบชายฝั่งรอบเกาะ · ทุกย่านหันหน้าเข้าหาหอดัชนี'],
  ['🌳 สวนในย่าน', 'แปลงที่ไม่มีบริษัทหรือบ้านกลายเป็นสวนสาธารณะเล็ก ๆ (ตกแต่งเท่านั้น)'],
];

export function LegendModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4" onClick={onClose}>
      <div className="card pop-in max-h-[90vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 font-display text-lg font-semibold">วิธีอ่านเมือง</h2>
        <ul className="space-y-1.5 text-sm">
          {LEGEND.map(([k, v]) => (
            <li key={k} className="flex gap-2">
              <span className="w-36 shrink-0 font-semibold">{k}</span>
              <span className="text-muted">{v}</span>
            </li>
          ))}
        </ul>
        <h3 className="mb-1.5 mt-4 text-sm font-semibold">หน้าตาตึกบอกประเภทธุรกิจ</h3>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {ARCHITECTURE.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-soft px-2.5 py-1.5">
              <b>{k}</b>
              <div className="text-muted">{v}</div>
            </div>
          ))}
        </div>
        <h3 className="mb-1.5 mt-4 text-sm font-semibold">สภาพอากาศ = อารมณ์ตลาด</h3>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {(Object.keys(WEATHER_LABEL) as Weather[]).map((w) => (
            <div key={w} className="rounded-xl bg-soft px-2.5 py-1.5">
              <b>
                {WEATHER_LABEL[w].icon} {WEATHER_LABEL[w].th}
              </b>
              <div className="text-muted">{WEATHER_LABEL[w].hint}</div>
            </div>
          ))}
        </div>
        <button className="btn-primary mt-4 w-full" onClick={onClose}>
          เข้าใจแล้ว
        </button>
      </div>
    </div>,
    document.body,
  );
}
