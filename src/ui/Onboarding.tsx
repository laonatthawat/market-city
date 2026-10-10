import { useState } from 'react';
import { loadJson, saveJson } from '../lib/storage';
import { useGame } from '../store/gameStore';

const SLIDES = [
  {
    icon: '🏙️',
    title: 'ยินดีต้อนรับสู่ Market City',
    text: 'เมืองที่ทุกตึกคือบริษัทจริง และทุกวันในเกมคือวันซื้อขายจริงในอดีต คุณจะได้ฝึกตัดสินใจลงทุนในช่วงเวลาสำคัญ แล้วดูทันทีว่าเกิดอะไรขึ้นจริง',
  },
  {
    icon: '🏢',
    title: 'อ่านเมืองให้เป็น',
    text: 'ตึกสูงคือบริษัทมูลค่าใหญ่ ไฟหน้าต่างสว่างคือราคากำลังขึ้น สีฟ้าคือหุ้นถูก สีส้มคือหุ้นแพง และสภาพอากาศคืออารมณ์ของตลาด',
  },
  {
    icon: '🎓',
    title: 'เริ่มจากบทเรียนสั้น ๆ',
    text: 'บทเรียนละ 3–5 นาที มีโค้ชบอกทีละขั้น พอพร้อมแล้วค่อยไปลองเล่น Market Run ที่สุ่มช่วงเวลาจริงให้แบบไม่บอกล่วงหน้า',
  },
];

/** First-visit welcome (shown once, stored in localStorage). */
export function Onboarding() {
  const [done, setDone] = useState(() => loadJson('mc.onboarded', false));
  const [i, setI] = useState(0);
  const startChapter = useGame((s) => s.startChapter);
  const dataset = useGame((s) => s.dataset);
  if (done) return null;
  const finish = () => {
    saveJson('mc.onboarded', true);
    setDone(true);
  };
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/25 p-4">
      <div key={i} className="card pop-in w-full max-w-md p-6 text-center">
        <div className="text-5xl">{slide.icon}</div>
        <h2 className="mt-2 font-display text-xl font-semibold">{slide.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{slide.text}</p>
        <div className="mt-4 flex justify-center gap-1.5">
          {SLIDES.map((_, k) => (
            <i key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-accent' : 'w-1.5 bg-line'}`} />
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button className="btn-soft flex-1" onClick={finish}>
            {last ? 'ไปที่เมนู' : 'ข้าม'}
          </button>
          {last ? (
            <button
              className="btn-primary flex-1"
              disabled={!dataset}
              onClick={() => {
                finish();
                void startChapter('ch1');
              }}
            >
              เริ่มบทที่ 1 →
            </button>
          ) : (
            <button className="btn-primary flex-1" onClick={() => setI(i + 1)}>
              ต่อไป →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
