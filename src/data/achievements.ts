import type { Report } from '../engine/scoring';

export interface AchievementCtx {
  kind: 'run' | 'sandbox' | 'chapter';
  report?: Report;
  funding?: 'lump' | 'dca';
  challenge: boolean;
  challengeFailed: boolean;
  hadTaggedEvent: boolean;
  goldenDays: number;
  skippedPaydays: number;
  /** Weighted dividend yield of holdings at the end of the run. */
  dividendYield: number;
  chaptersDone: number;
  runsPlayed: number;
}

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  /** The exact condition. */
  desc: string;
  /** Practical how-to, shown when the player taps the badge. */
  hint: string;
  check: (c: AchievementCtx) => boolean;
}

const isRun = (c: AchievementCtx) => c.kind !== 'chapter' && !!c.report;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_run', icon: '🏁', title: 'ก้าวแรกในเมือง', desc: 'เล่น Market Run จนจบครั้งแรก', hint: 'ไปที่แท็บ Market Run กด "เริ่มเล่น" แล้วเล่นจนหมดเวลาหรือกด "จบรอบ" (โหมด Sandbox ไม่นับ)', check: (c) => c.kind === 'run' && !!c.report },
  { id: 'beat_index', icon: '🏆', title: 'ชนะดัชนี', desc: 'จบรอบด้วยผลตอบแทนสูงกว่าดัชนีเมือง', hint: 'ตอนจบรอบ ผลตอบแทนพอร์ตต้องมากกว่าดัชนีเมือง ดูได้ในแผงพอร์ตที่บอก "นำดัชนี / ตามดัชนี" ลองซื้อกระจายหลายบริษัทที่แข็งแรงแล้วถือยาว', check: (c) => isRun(c) && c.report!.excess > 0 },
  {
    id: 'crash_survivor',
    icon: '⛈️',
    title: 'ฝ่าพายุมาได้',
    desc: 'ถือผ่านช่วงตลาดลง 20% ขึ้นไปโดยไม่ขายทิ้ง และจบรอบด้วยกำไร',
    hint: 'ต้องเจอรอบที่ตลาดลงตั้งแต่ 20% (ฟ้ามีพายุ ⛈️) แล้วไม่ขายหุ้นทิ้งตอนนั้น และจบรอบด้วยกำไร เลือกระยะเวลา 3 ปีจะมีโอกาสเจอมากขึ้น',
    check: (c) => isRun(c) && c.report!.indexMaxDrawdown >= 0.2 && c.report!.heldThroughDrawdown && c.report!.totalReturn > 0,
  },
  {
    id: 'no_fomo',
    icon: '🧘',
    title: 'ไม่ไล่ยอดดอย',
    desc: 'ผ่านช่วงตลาดคึกคัก (แสงทอง) โดยไม่ซื้อหุ้นแบบ FOMO สักครั้ง',
    hint: 'ต้องมีช่วงแสงทอง ✨ (ตลาดคึกคัก) อย่างน้อย 20 วันในรอบ ซื้อขายรวมอย่างน้อย 5 ครั้ง แต่ห้ามไล่ซื้อหุ้นที่เพิ่งพุ่งแรงในช่วงนั้น',
    check: (c) => isRun(c) && c.goldenDays >= 20 && c.report!.fomoBuys.length === 0 && c.report!.trades >= 5,
  },
  { id: 'diversified', icon: '🌈', title: 'ไข่หลายตะกร้า', desc: 'คะแนนกระจายความเสี่ยงเฉลี่ยตั้งแต่ 70 ขึ้นไป', hint: 'ถือหุ้นหลายตัวจากหลายกลุ่มธุรกิจตลอดรอบ ไม่ให้ตัวใดหนักเกินไป แถบสัดส่วนพอร์ตควรมีหลายสีพอ ๆ กัน', check: (c) => isRun(c) && c.report!.avgDiversification >= 0.7 },
  { id: 'disciplined', icon: '🎯', title: 'วินัยเหล็ก', desc: 'คะแนนพฤติกรรมตั้งแต่ 90 ขึ้นไป', hint: 'ไม่ขายตอนตลาดตกแรงด้วยความตกใจ ไม่ไล่ซื้อหุ้นที่เพิ่งพุ่ง และไม่ซื้อขายถี่เกินไป ดูคะแนนพฤติกรรมได้ในหน้าสรุปผล', check: (c) => isRun(c) && c.report!.behaviorScore >= 90 },
  { id: 'patient', icon: '🐢', title: 'ช้าแต่ชัวร์', desc: 'ซื้อขายไม่เกิน 10 ครั้ง และยังชนะดัชนี', hint: 'ซื้อขายรวม 1–10 ครั้งทั้งรอบ เช่น ซื้อกระจายตอนต้นแล้วถือยาว และต้องชนะดัชนีด้วย', check: (c) => isRun(c) && c.report!.trades <= 10 && c.report!.trades > 0 && c.report!.excess > 0 },
  { id: 'event_veteran', icon: '📰', title: 'ผ่านเหตุการณ์จริง', desc: 'ชนะดัชนีในรอบที่มีเหตุการณ์สำคัญทางประวัติศาสตร์', hint: 'ราว 1 ใน 4 รอบมีเหตุการณ์จริงซ่อนอยู่ เช่น โควิด 2020 หรือตลาดหมี 2022 ต้องชนะดัชนีในรอบนั้น หน้าสรุปผลจะเฉลยว่าเจอเหตุการณ์อะไร', check: (c) => isRun(c) && c.hadTaggedEvent && c.report!.excess > 0 },
  { id: 'dca_consistent', icon: '📅', title: 'ออมสม่ำเสมอ', desc: 'จบรอบ DCA โดยไม่ข้ามการลงทุนสักเดือน', hint: 'เล่น Market Run แบบ "ออมรายเดือน (DCA)" และอย่ากดข้ามการลงทุนในวันเงินเดือนออกเลยสักเดือน', check: (c) => isRun(c) && c.funding === 'dca' && c.skippedPaydays === 0 },
  { id: 'challenge_clear', icon: '🛡️', title: 'ผ่านภารกิจ', desc: 'จบรอบที่เปิดโหมดท้าทายโดยไม่ล้มเหลว', hint: 'ในแท็บ Market Run เลือกโหมดท้าทายอย่างน้อย 1 ข้อ แล้วเล่นจนจบโดยไม่ผิดกติกา', check: (c) => isRun(c) && c.challenge && !c.challengeFailed },
  { id: 'dividend_collector', icon: '🌷', title: 'นักสะสมปันผล', desc: 'จบรอบด้วยพอร์ตที่มีอัตราปันผลเฉลี่ยตั้งแต่ 3%', hint: 'ตอนจบรอบ หุ้นที่ถือต้องมีอัตราปันผลเฉลี่ยตั้งแต่ 3% ต่อปี ดูช่อง "ปันผล" ในข้อมูลบริษัท กลุ่มพลังงาน การเงิน และอสังหาฯ มักปันผลสูง', check: (c) => isRun(c) && c.dividendYield >= 0.03 },
  { id: 'grade_a', icon: '⭐', title: 'นักเรียนดีเด่น', desc: 'ได้เกรดรวม A ขึ้นไป', hint: 'ทำให้ดีครบทุกด้านในหน้าสรุปผล: ชนะดัชนี คุมการขาดทุน กระจายพอร์ต และมีวินัย', check: (c) => isRun(c) && (c.report!.grades.overall === 'A' || c.report!.grades.overall === 'A+') },
  { id: 'sandbox_explorer', icon: '🧪', title: 'นักทดลอง', desc: 'เล่นโหมด Sandbox จนจบ', hint: 'ไปที่แท็บ Sandbox กด "เริ่มเล่น" แล้วเล่นจนจบ', check: (c) => c.kind === 'sandbox' && !!c.report },
  { id: 'scholar_3', icon: '📘', title: 'ผู้เริ่มต้นเรียนรู้', desc: 'เรียนจบ 3 บท', hint: 'ไปที่แท็บบทเรียน แล้วเรียนให้จบ 3 บท บทละ 3–5 นาที', check: (c) => c.chaptersDone >= 3 },
  { id: 'scholar_8', icon: '🎓', title: 'บัณฑิตแห่งเมือง', desc: 'เรียนจบครบทั้ง 8 บท', hint: 'เรียนให้จบครบทั้ง 8 บทในแท็บบทเรียน', check: (c) => c.chaptersDone >= 8 },
];

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Ids newly earned in this context. */
export function newAchievements(ctx: AchievementCtx, owned: readonly string[]): string[] {
  return ACHIEVEMENTS.filter((a) => !owned.includes(a.id) && a.check(ctx)).map((a) => a.id);
}
