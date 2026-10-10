/**
 * Special civic buildings that appear in the main city once unlocked.
 * Progress comes from learning and discipline (chapters, achievements), not only profit.
 */

export type DecoKind = 'library' | 'lighthouse' | 'observatory' | 'garden' | 'statue' | 'landmark';

export interface Requirement {
  chapter?: string;
  achievement?: string;
  chaptersDone?: number;
  achievementsCount?: number;
  runsPlayed?: number;
}

export interface DecoDef {
  kind: DecoKind;
  icon: string;
  name: string;
  desc: string;
  requires: Requirement;
  requiresText: string;
  /** What the building stands for (shown when it is clicked). */
  meaning: string;
  /** What it does in the city, if anything. */
  effect: string;
}

export const DECOS: DecoDef[] = [
  { kind: 'library', icon: '📚', name: 'ห้องสมุด', desc: 'อาคารแห่งความรู้เรื่องมูลค่าหุ้น', requires: { chapter: 'ch2' }, requiresText: 'เรียนจบบทที่ 2 (มูลค่าหุ้น)', meaning: 'ความรู้เรื่องการประเมินมูลค่าหุ้น ราคาหุ้นจะถูกหรือแพงต้องดูเทียบกับกำไรและทรัพย์สิน เช่น P/E และ P/B ไม่ใช่ดูแค่ว่าราคาขึ้นหรือลง', effect: 'เป็นรางวัลที่ระลึก ไม่มีผลกับเงินหรือคะแนน' },
  { kind: 'lighthouse', icon: '🗼', name: 'ประภาคาร', desc: 'นำทางผ่านพายุ — การบริหารความเสี่ยง', requires: { chapter: 'ch4' }, requiresText: 'เรียนจบบทที่ 4 (ความผันผวน)', meaning: 'การบริหารความเสี่ยงช่วงตลาดผันผวน หุ้นที่แกว่งแรงอาจลงลึกได้มาก ควรถือในสัดส่วนที่รับไหว และไม่ตกใจขายตอนพายุเข้า', effect: 'เป็นรางวัลที่ระลึก ไม่มีผลกับเงินหรือคะแนน' },
  { kind: 'observatory', icon: '🔭', name: 'หอดูดาว', desc: 'มองภาพใหญ่ของเศรษฐกิจมหภาค', requires: { chapter: 'ch7' }, requiresText: 'เรียนจบบทที่ 7 (ดอกเบี้ยและมหภาค)', meaning: 'การมองภาพใหญ่ของเศรษฐกิจ ดอกเบี้ย เงินเฟ้อ และนโยบายธนาคารกลางกระทบหุ้นทั้งตลาด แต่กระทบแต่ละกลุ่มไม่เท่ากัน', effect: 'เป็นรางวัลที่ระลึก ไม่มีผลกับเงินหรือคะแนน' },
  { kind: 'garden', icon: '🌷', name: 'สวนปันผล', desc: 'ดอกไม้บานตามปันผลของพอร์ต', requires: { achievement: 'dividend_collector' }, requiresText: 'ได้ความสำเร็จ "นักสะสมปันผล"', meaning: 'รายได้จากเงินปันผล บริษัทที่แข็งแรงหลายแห่งแบ่งกำไรให้ผู้ถือหุ้นสม่ำเสมอ เป็นผลตอบแทนที่ได้แม้ราคาหุ้นไม่ขึ้น', effect: 'ดอกไม้บานใหญ่ขึ้นตามอัตราปันผลเฉลี่ยของหุ้นที่คุณถือ (บานเต็มที่เมื่อราว 3% ต่อปี)' },
  { kind: 'statue', icon: '🗽', name: 'รูปปั้นผู้ชนะ', desc: 'สำหรับคนที่เคยชนะดัชนี', requires: { achievement: 'beat_index' }, requiresText: 'ชนะดัชนีเมือง 1 ครั้ง', meaning: 'การทำผลตอบแทนได้ดีกว่าดัชนีเมือง ซึ่งคือการซื้อทุกบริษัทในเมืองเท่า ๆ กันแล้วถือไว้ ทำได้ยากแม้แต่มืออาชีพ', effect: 'เป็นรางวัลที่ระลึก ไม่มีผลกับเงินหรือคะแนน' },
  { kind: 'landmark', icon: '🏛️', name: 'หอเกียรติยศ', desc: 'แลนด์มาร์กของนักลงทุนดีเด่น', requires: { achievement: 'grade_a' }, requiresText: 'ได้เกรดรวม A ขึ้นไป', meaning: 'การลงทุนที่ดีครบทุกด้าน ทั้งผลตอบแทน ความเสี่ยง การกระจาย และวินัย จนได้เกรดรวม A', effect: 'เป็นรางวัลที่ระลึก ไม่มีผลกับเงินหรือคะแนน' },
];

export interface ProgressSnapshot {
  chapters: readonly string[];
  achievements: readonly string[];
  runsPlayed: number;
}

export function meets(req: Requirement | undefined, p: ProgressSnapshot): boolean {
  if (!req) return true;
  if (req.chapter && !p.chapters.includes(req.chapter)) return false;
  if (req.achievement && !p.achievements.includes(req.achievement)) return false;
  if (req.chaptersDone && p.chapters.length < req.chaptersDone) return false;
  if (req.achievementsCount && p.achievements.length < req.achievementsCount) return false;
  if (req.runsPlayed && p.runsPlayed < req.runsPlayed) return false;
  return true;
}

export function decoDef(kind: DecoKind): DecoDef {
  return DECOS.find((d) => d.kind === kind)!;
}
