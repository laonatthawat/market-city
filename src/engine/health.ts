import type { FundamentalsSnapshot, SectorId } from './types';

export interface HealthReason {
  tone: 'good' | 'bad' | 'neutral';
  text: string;
}

export interface HealthScore {
  score: number; // 0..100
  label: string;
  reasons: HealthReason[];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Rule-based, plain-language health check. Educational, not a recommendation. */
export function healthScore(f: FundamentalsSnapshot, sector: SectorId): HealthScore {
  let score = 50;
  const reasons: HealthReason[] = [];
  const add = (delta: number, tone: HealthReason['tone'], text: string) => {
    score += delta;
    reasons.push({ tone, text });
  };

  if (f.netMargin >= 0.15) add(12, 'good', `อัตรากำไรสุทธิสูง (${pct(f.netMargin)}) ธุรกิจทำกำไรได้ดี`);
  else if (f.netMargin < 0) add(-18, 'bad', `บริษัทยังขาดทุน (อัตรากำไร ${pct(f.netMargin)})`);
  else if (f.netMargin < 0.05) add(-5, 'neutral', `อัตรากำไรบาง (${pct(f.netMargin)}) ต้นทุนเปลี่ยนนิดเดียวก็กระทบกำไร`);

  if (f.revenueGrowth != null) {
    if (f.revenueGrowth >= 0.1) add(10, 'good', `รายได้โตเร็ว ${pct(f.revenueGrowth)} ต่อปี`);
    else if (f.revenueGrowth < 0) add(-10, 'bad', `รายได้หดตัว ${pct(f.revenueGrowth)} จากปีก่อน`);
    else add(2, 'neutral', `รายได้โตปานกลาง ${pct(f.revenueGrowth)}`);
  }

  // Banks and insurers run on leverage by design, so judge them more gently.
  const deHigh = sector === 'finance' ? 8 : sector === 'realestate' ? 2.5 : 2;
  const deLow = sector === 'finance' ? 3 : 1;
  if (f.debtToEquity > deHigh) add(-12, 'bad', `หนี้สูง (D/E ${f.debtToEquity.toFixed(2)} เท่า) เสี่ยงเมื่อดอกเบี้ยขึ้นหรือรายได้สะดุด`);
  else if (f.debtToEquity < deLow) add(8, 'good', `หนี้ต่ำ (D/E ${f.debtToEquity.toFixed(2)} เท่า) งบดุลแข็งแรง`);

  if (f.pe == null) add(-6, 'bad', 'ไม่มีค่า P/E เพราะกำไรติดลบ ประเมินมูลค่ายาก');
  else if (f.pe > 45) add(-8, 'neutral', `P/E สูงมาก (${f.pe.toFixed(1)} เท่า) ตลาดคาดหวังการเติบโตสูง ถ้าผิดหวังราคาอาจร่วงแรง`);
  else if (f.pe < 12) add(4, 'neutral', `P/E ต่ำ (${f.pe.toFixed(1)} เท่า) อาจถูก หรือตลาดกังวลอนาคตของบริษัท`);

  const t = f.epsTrend;
  if (t.length >= 2) {
    const last = t[t.length - 1].eps;
    const prev = t[t.length - 2].eps;
    if (prev > 0 && last > prev * 1.05) add(6, 'good', 'กำไรต่อหุ้น (EPS) เพิ่มขึ้นจากปีก่อน');
    else if (last < prev * 0.9) add(-8, 'bad', 'กำไรต่อหุ้น (EPS) ลดลงจากปีก่อน');
  }

  if (f.dividendYield >= 0.03) add(3, 'good', `จ่ายปันผลสม่ำเสมอ (ผลตอบแทน ${pct(f.dividendYield)} ต่อปี)`);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 70 ? 'แข็งแรง' : score >= 45 ? 'ปานกลาง' : 'ควรระวัง';
  return { score, label, reasons };
}
