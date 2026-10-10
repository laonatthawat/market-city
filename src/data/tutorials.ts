import type { OptionStyle } from '../engine/decisions/types';
import type { SectorId } from '../engine/types';
import { baht, pct } from '../lib/format';

/**
 * Tutorial chapters. Each one replays a curated slice of history and ends with a Decision Point.
 * Companies are referenced by role; with the simulated dataset roles fall back to same-sector companies,
 * so text must never state an outcome before it happens — outcome text is computed from the data.
 */

export interface ChapterCompany {
  role: string;
  ticker: string;
  sector: SectorId;
}

export type ScriptedAction =
  | { kind: 'hold' }
  | { kind: 'buy_role'; roles: string[]; cashFraction: number }
  | { kind: 'trim_role'; role: string; fraction: number }
  | { kind: 'rotate_role'; sellRole: string; sellFraction: number; buyRoles: string[] }
  | { kind: 'dca_role'; roles: string[]; cashFraction: number; parts: number; everyDays: number }
  | { kind: 'mix'; parts: { roles: string[]; cashFraction: number }[] };

export type StepWait = { kind: 'next' } | { kind: 'select'; role: string } | { kind: 'buy'; role: string } | { kind: 'play' };

export interface TutorialStep {
  title: string;
  text: string;
  wait: StepWait;
  /** Roles whose buildings get a red frame during this step. */
  highlight?: string[];
  /** UI elements (data-tutorial names) outlined in red during this step. */
  ui?: string[];
}

/** Values available when the chapter's decision opens. */
export interface ChapterDecisionCtx {
  name: (role: string) => string;
  names: (role: string) => string[];
  change: (role: string, days: number) => number;
  weight: (role: string) => number;
  avgPe: (role: string) => number | null;
  cash: number;
  total: number;
}

export interface ChapterOutcomeCtx extends ChapterDecisionCtx {
  roleReturn: (role: string) => number;
  indexReturn: number;
  weeks: number;
}

export interface ChapterDef {
  id: string;
  number: number;
  title: string;
  concept: string;
  start: string;
  decisionDate: string;
  forwardDays: number;
  startingCash: number;
  companies: ChapterCompany[];
  /** Holdings bought automatically at the start (fraction of starting cash). */
  preset?: { role: string; fraction: number }[];
  steps: TutorialStep[];
  decision: {
    title: (c: ChapterDecisionCtx) => string;
    prompt: (c: ChapterDecisionCtx) => string;
    options: { id: string; label: string; detail: (c: ChapterDecisionCtx) => string; style: OptionStyle; action: ScriptedAction }[];
    lesson: (c: ChapterOutcomeCtx) => string[];
    considerations: string[];
  };
  takeaways: string[];
}

const p1 = (x: number) => pct(x, 1);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export const groupReturn = avg;

export const CHAPTERS: ChapterDef[] = [
  {
    id: 'ch1',
    number: 1,
    title: 'หุ้นคืออะไร และอ่านกราฟอย่างไร',
    concept: 'ความเป็นเจ้าของบริษัท · แท่งเทียน · เส้นค่าเฉลี่ย',
    start: '2019-01-02',
    decisionDate: '2019-06-03',
    forwardDays: 63,
    startingCash: 100_000,
    companies: [
      { role: 'focus', ticker: 'AAPL', sector: 'tech' },
      { role: 'other', ticker: 'MSFT', sector: 'tech' },
      { role: 'other', ticker: 'KO', sector: 'consumer' },
      { role: 'other', ticker: 'JPM', sector: 'finance' },
      { role: 'other', ticker: 'XOM', sector: 'energy' },
      { role: 'other', ticker: 'JNJ', sector: 'healthcare' },
      { role: 'other', ticker: 'CAT', sector: 'industrial' },
      { role: 'other', ticker: 'PLD', sector: 'realestate' },
    ],
    steps: [
      {
        title: 'ยินดีต้อนรับสู่ Market City',
        text: 'หุ้นคือส่วนหนึ่งของความเป็นเจ้าของบริษัท ถ้าบริษัททำกำไรได้มากขึ้น ส่วนที่คุณเป็นเจ้าของก็มีค่ามากขึ้นด้วย ในเมืองนี้ตึกแต่ละหลังคือบริษัทจริงในอดีต (ชื่อจริงถูกปิดไว้ก่อน) และตึกยิ่งสูงแปลว่าบริษัทยิ่งมีมูลค่าตลาดมาก',
        wait: { kind: 'next' },
      },
      {
        title: 'ลองคลิกตึก',
        text: 'คลิกตึกที่มีกรอบสีแดง ถ้าหาไม่เจอ กดปุ่ม "เลือกให้เลย" ในการ์ดนี้ได้',
        wait: { kind: 'select', role: 'focus' },
        highlight: ['focus'],
      },
      {
        title: 'อ่านกราฟแท่งเทียน',
        text: 'แท่งเทียนหนึ่งแท่งคือราคาหนึ่งวัน แท่งเขียวแปลว่าวันนั้นราคาปิดสูงกว่าราคาเปิด แท่งแดงแปลว่าปิดต่ำกว่าเปิด ส่วนไส้เทียนบอกราคาสูงสุดและต่ำสุดของวัน แท่งเล็ก ๆ ด้านล่างคือปริมาณการซื้อขาย และเส้นส้ม MA50 คือราคาเฉลี่ย 50 วัน ใช้ดูแนวโน้มได้ ลองกดปุ่ม 3 เดือน / 1 ปี / ทั้งหมด หรือสลับเป็นแท่งรายสัปดาห์ดูก็ได้',
        wait: { kind: 'next' },
        ui: ['chart'],
      },
      {
        title: 'ซื้อหุ้นตัวแรก',
        text: 'ดูกล่อง "ซื้อ" ที่มีกรอบสีแดงในแผงด้านขวา ลองใช้เงินราว 30–50% ของเงินทุน (กดปุ่ม 25% หรือ 50% ได้เลย) แล้วกดซื้อ ทุกการซื้อขายมีค่าธรรมเนียม 0.15%',
        wait: { kind: 'buy', role: 'focus' },
        ui: ['trade-form'],
        highlight: ['focus'],
      },
      {
        title: 'ปล่อยให้เวลาเดิน',
        text: 'กดปุ่มเล่นที่มีกรอบสีแดง (หรือปุ่ม ▶ เล่น 20x ในการ์ดนี้) แล้วสังเกตตึกไปด้วย ไฟหน้าต่างสว่างแปลว่าราคาช่วงนี้ขึ้น ไฟหรี่แปลว่าราคาลง ธงสีชมพูบนหลังคาคือหุ้นที่คุณถืออยู่ เกมจะหยุดเองเมื่อถึงจุดที่ต้องตัดสินใจ',
        wait: { kind: 'play' },
        ui: ['play'],
      },
    ],
    decision: {
      title: (c) => {
        const ch = c.change('focus', 21);
        return `${c.name('focus')} ${ch >= 0 ? 'ขึ้น' : 'ลง'} ${pct(Math.abs(ch), 1, false)} ในเดือนที่ผ่านมา`;
      },
      prompt: (c) =>
        `ช่วงเดือนที่ผ่านมาราคา ${c.name('focus')} เปลี่ยนไป ${p1(c.change('focus', 21))} และเปลี่ยนไป ${p1(c.change('focus', 100))} นับจากต้นเรื่อง หุ้นตัวนี้คิดเป็น ${pct(c.weight('focus'), 0, false)} ของพอร์ตคุณ จะทำอย่างไรต่อ?`,
      options: [
        { id: 'buy_more', label: 'ซื้อเพิ่ม', detail: (c) => `ใช้เงินสดครึ่งหนึ่ง (${baht(c.cash * 0.5)})`, style: 'buy', action: { kind: 'buy_role', roles: ['focus'], cashFraction: 0.5 } },
        { id: 'hold', label: 'ถือต่อ ไม่ทำอะไร', detail: () => 'ปล่อยพอร์ตไว้ตามเดิม', style: 'hold', action: { kind: 'hold' } },
        { id: 'trim', label: 'ขายครึ่งหนึ่ง', detail: () => 'ล็อกผลไว้ครึ่งหนึ่ง', style: 'sell', action: { kind: 'trim_role', role: 'focus', fraction: 0.5 } },
        { id: 'sell_all', label: 'ขายทั้งหมด', detail: () => 'ถือเงินสดแทน', style: 'sell', action: { kind: 'trim_role', role: 'focus', fraction: 1 } },
      ],
      lesson: (c) => [
        `ในช่วงต่อมา ${c.name('focus')} เปลี่ยนไป ${p1(c.roleReturn('focus'))} ส่วนดัชนีเมืองเปลี่ยนไป ${p1(c.indexReturn)}`,
        'ราคาหุ้นระยะสั้นแกว่งไปตามข่าวและอารมณ์ของตลาด แต่ระยะยาวจะเดินตามความสามารถทำกำไรของบริษัท',
      ],
      considerations: [
        'ก่อนตัดสินใจ ลองเปิดดูคะแนนสุขภาพและปัจจัยพื้นฐาน แล้วถามว่าราคาที่ขยับนั้นเปลี่ยน "มูลค่าธุรกิจ" จริงหรือเปล่า',
        'ถ้าหุ้นตัวเดียวกินสัดส่วนพอร์ตมาก การซื้อเพิ่มจะยิ่งเพิ่มความเสี่ยงที่กระจุกตัว',
        'การขายเพราะกลัว และการซื้อเพราะตื่นเต้น เป็นสองความผิดพลาดที่นักลงทุนมือใหม่เจอบ่อยที่สุด',
      ],
    },
    takeaways: [
      'ตึกหนึ่งหลังคือหนึ่งบริษัท และความสูงของตึกคือมูลค่าตลาด',
      'แท่งเทียนบอกราคาเปิด ปิด สูงสุด และต่ำสุดของแต่ละวัน',
      'ราคาระยะสั้นผันผวนเสมอ ควรตัดสินใจด้วยเหตุผลและแผน ไม่ใช่อารมณ์',
    ],
  },
  {
    id: 'ch2',
    number: 2,
    title: 'มูลค่าหุ้น: P/E, หุ้นเติบโต vs หุ้นคุณค่า',
    concept: 'P/E · Growth vs Value · ความคาดหวังของตลาด',
    start: '2021-11-01',
    decisionDate: '2021-12-31',
    forwardDays: 63,
    startingCash: 200_000,
    companies: [
      { role: 'growth', ticker: 'NVDA', sector: 'tech' },
      { role: 'growth', ticker: 'ADBE', sector: 'tech' },
      { role: 'growth', ticker: 'NFLX', sector: 'tech' },
      { role: 'value', ticker: 'XOM', sector: 'energy' },
      { role: 'value', ticker: 'CVX', sector: 'energy' },
      { role: 'value', ticker: 'JPM', sector: 'finance' },
      { role: 'other', ticker: 'KO', sector: 'consumer' },
      { role: 'other', ticker: 'JNJ', sector: 'healthcare' },
      { role: 'other', ticker: 'CAT', sector: 'industrial' },
    ],
    steps: [
      {
        title: 'P/E คืออะไร',
        text: 'P/E คือราคาหุ้นหารด้วยกำไรต่อหุ้น บอกว่าเราจ่ายเงินกี่บาทเพื่อซื้อกำไร 1 บาทของบริษัท หุ้นที่ P/E สูงมักเป็น "หุ้นเติบโต" (Growth) ที่ตลาดคาดว่ากำไรจะโตเร็ว ส่วนหุ้นที่ P/E ต่ำมักเป็น "หุ้นคุณค่า" (Value) ที่ราคาถูกเมื่อเทียบกับกำไร แต่บางครั้งก็ถูกเพราะอนาคตไม่สดใส',
        wait: { kind: 'next' },
      },
      {
        title: 'สีตึกบอก P/E',
        text: 'ตึกสีฟ้าคือ P/E ต่ำ (ถูก) สีครีมคือกลาง ๆ สีส้มคือ P/E สูง (แพง) ลองคลิกตึกหุ้นเติบโตที่มีกรอบสีแดง แล้วดูค่า P/E กับ "รายได้โต" ในแผงขวา',
        wait: { kind: 'select', role: 'growth' },
        highlight: ['growth'],
      },
      {
        title: 'เทียบกับหุ้นคุณค่า',
        text: 'คราวนี้ลองคลิกตึกหุ้นคุณค่าที่มีกรอบสีแดง แล้วเทียบ P/E อัตรากำไร และปันผลกับตัวที่แล้ว',
        wait: { kind: 'select', role: 'value' },
        highlight: ['value'],
      },
      {
        title: 'ไม่มีแบบไหนดีกว่าเสมอ',
        text: 'หุ้นเติบโตให้ผลตอบแทนสูงได้ถ้ากำไรโตตามที่หวัง แต่ถ้าผิดหวังก็ร่วงแรง ส่วนหุ้นคุณค่ามักผันผวนน้อยกว่า แต่ก็อาจโตช้า กด ▶ เพื่อเดินเวลาไปจนถึงปลายปี เกมจะถามว่าคุณจะลงทุนอย่างไร',
        wait: { kind: 'play' },
        ui: ['play'],
      },
    ],
    decision: {
      title: () => 'ปลายปี: จะลงทุนเงินก้อนนี้อย่างไร?',
      prompt: (c) => {
        const g = c.avgPe('growth');
        const v = c.avgPe('value');
        return `กลุ่มหุ้นเติบโต (${c.names('growth').join(', ')}) มี P/E เฉลี่ย ${g ? g.toFixed(0) : '–'} เท่า ส่วนกลุ่มหุ้นคุณค่า (${c.names('value').join(', ')}) มี P/E เฉลี่ย ${v ? v.toFixed(0) : '–'} เท่า คุณมีเงินสด ${baht(c.cash)} จะเลือกแบบไหน?`;
      },
      options: [
        { id: 'growth', label: 'ลงหุ้นเติบโต', detail: (c) => `ใช้เงินสด 90% ซื้อ ${c.names('growth').length} ตัวเท่า ๆ กัน`, style: 'buy', action: { kind: 'buy_role', roles: ['growth'], cashFraction: 0.9 } },
        { id: 'value', label: 'ลงหุ้นคุณค่า', detail: (c) => `ใช้เงินสด 90% ซื้อ ${c.names('value').length} ตัวเท่า ๆ กัน`, style: 'buy', action: { kind: 'buy_role', roles: ['value'], cashFraction: 0.9 } },
        { id: 'mix', label: 'ผสมทั้งสองแบบ', detail: () => 'ใช้เงินสด 90% ซื้อทั้ง 6 ตัวเท่า ๆ กัน', style: 'rebalance', action: { kind: 'buy_role', roles: ['growth', 'value'], cashFraction: 0.9 } },
        { id: 'cash', label: 'ถือเงินสดรอดูก่อน', detail: () => 'ยังไม่ลงทุน', style: 'hold', action: { kind: 'hold' } },
      ],
      lesson: (c) => [
        `ในช่วงต่อมา กลุ่มหุ้นเติบโตเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('growth'))} ส่วนกลุ่มหุ้นคุณค่าเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('value'))} (ดัชนีเมือง ${p1(c.indexReturn)})`,
        'หุ้น P/E สูงคือหุ้นที่มูลค่าส่วนใหญ่มาจากกำไรในอนาคตที่ยังอยู่อีกไกล พอสภาพแวดล้อมเปลี่ยน เช่น ดอกเบี้ยขึ้นหรือการเติบโตชะลอ ราคาจึงมักโดนกระทบแรงกว่า',
      ],
      considerations: [
        'P/E สูงไม่ได้แปลว่าแพงเกินไปเสมอ ถ้ากำไรโตได้ทันราคา หุ้นเติบโตก็ชนะยาว ๆ มาแล้วหลายช่วง',
        'P/E ต่ำอาจเป็นกับดัก (value trap) ถ้ากำไรของบริษัทกำลังจะลดลง',
        'การผสมทั้งสองสไตล์ช่วยให้พอร์ตไม่ต้องพึ่งการเดาว่าสไตล์ไหนจะชนะในปีนั้น',
      ],
    },
    takeaways: [
      'P/E = ราคา ÷ กำไรต่อหุ้น เป็นตัวบอกว่าตลาดคาดหวังกับบริษัทมากแค่ไหน',
      'หุ้นเติบโตมีความคาดหวังสูง ผันผวนสูง และไวต่อดอกเบี้ยกับข่าวผิดหวัง',
      'หุ้นคุณค่าถูกเมื่อเทียบกับกำไร แต่ต้องเช็กให้ดีว่าถูกเพราะอะไร',
    ],
  },
  {
    id: 'ch3',
    number: 3,
    title: 'กระจายความเสี่ยง และความเสี่ยงรายเซกเตอร์',
    concept: 'ไข่ในตะกร้าใบเดียว · ความสัมพันธ์ของหุ้นในกลุ่มเดียวกัน',
    start: '2020-01-02',
    decisionDate: '2020-02-14',
    forwardDays: 63,
    startingCash: 300_000,
    companies: [
      { role: 'energy', ticker: 'XOM', sector: 'energy' },
      { role: 'energy', ticker: 'CVX', sector: 'energy' },
      { role: 'energy', ticker: 'OXY', sector: 'energy' },
      { role: 'diversifier', ticker: 'MSFT', sector: 'tech' },
      { role: 'diversifier', ticker: 'JNJ', sector: 'healthcare' },
      { role: 'diversifier', ticker: 'WMT', sector: 'consumer' },
      { role: 'diversifier', ticker: 'JPM', sector: 'finance' },
      { role: 'diversifier', ticker: 'PLD', sector: 'realestate' },
      { role: 'diversifier', ticker: 'CAT', sector: 'industrial' },
    ],
    preset: [{ role: 'energy', fraction: 0.95 }],
    steps: [
      {
        title: 'พอร์ตที่ได้รับมา',
        text: 'คุณรับช่วงพอร์ตต่อจากนักลงทุนคนหนึ่งที่ชอบหุ้นพลังงานมาก เขาใส่เงิน 95% ไว้ในหุ้นพลังงาน 3 ตัว (ดูธงสีชมพูบนตึกในย่านพลังงาน)',
        wait: { kind: 'next' },
        highlight: ['energy'],
      },
      {
        title: 'ไข่ทุกฟองอยู่ในตะกร้าใบเดียว',
        text: 'ดูแถบสัดส่วนพอร์ตที่มีกรอบสีแดงในแผง "พอร์ตของฉัน" เกือบทั้งแถบเป็นสีเดียว หุ้นในเซกเตอร์เดียวกันมักขึ้นลงพร้อมกัน ถ้ามีข่าวร้ายกับพลังงาน เช่น ราคาน้ำมันตก ทั้ง 3 ตัวจะโดนพร้อมกัน นี่คือ "ความเสี่ยงรายเซกเตอร์"',
        wait: { kind: 'next' },
        ui: ['donut'],
      },
      {
        title: 'เมืองนี้มีหลายย่าน',
        text: 'การกระจายความเสี่ยงคือการถือหลายบริษัทจากหลายอุตสาหกรรมที่ไม่ได้ขึ้นลงพร้อมกัน ลองคลิกบริษัทในย่านอื่นที่มีกรอบสีแดงดูสักตัว',
        wait: { kind: 'select', role: 'diversifier' },
        highlight: ['diversifier'],
      },
      {
        title: 'เดินเวลาต่อ',
        text: 'กด ▶ เพื่อเดินเวลาไปอีกไม่กี่สัปดาห์ แล้วคุณจะได้ตัดสินใจว่าจะทำอะไรกับพอร์ตนี้',
        wait: { kind: 'play' },
        ui: ['play'],
      },
    ],
    decision: {
      title: () => 'พอร์ตนี้มีแต่หุ้นพลังงาน จะปรับไหม?',
      prompt: (c) =>
        `หุ้นพลังงาน 3 ตัวคิดเป็น ${pct(c.weight('energy'), 0, false)} ของพอร์ต ช่วง 6 สัปดาห์ที่ผ่านมากลุ่มนี้เปลี่ยนไปเฉลี่ย ${p1(c.change('energy', 30))} ขณะที่บริษัทในย่านอื่นเปลี่ยนไปเฉลี่ย ${p1(c.change('diversifier', 30))} จะทำอย่างไร?`,
      options: [
        { id: 'hold', label: 'ถือพอร์ตพลังงานต่อ', detail: () => 'ไม่เปลี่ยนอะไร', style: 'hold', action: { kind: 'hold' } },
        { id: 'diversify', label: 'กระจายไป 6 เซกเตอร์', detail: () => 'ขายหุ้นพลังงาน 60% แล้วซื้อบริษัทในย่านอื่นเท่า ๆ กัน', style: 'rebalance', action: { kind: 'rotate_role', sellRole: 'energy', sellFraction: 0.6, buyRoles: ['diversifier'] } },
        { id: 'cash', label: 'ขายพลังงานทั้งหมด ถือเงินสด', detail: () => 'ออกจากตลาดไปก่อน', style: 'sell', action: { kind: 'trim_role', role: 'energy', fraction: 1 } },
      ],
      lesson: (c) => [
        `ในช่วงต่อมา หุ้นพลังงานเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('energy'))} ส่วนบริษัทในย่านอื่นเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('diversifier'))} (ดัชนีเมือง ${p1(c.indexReturn)})`,
        'เมื่อทั้งพอร์ตผูกกับปัจจัยเดียว ผลลัพธ์ก็ขึ้นกับปัจจัยนั้นทั้งหมด การกระจายช่วยให้เหตุการณ์ของกลุ่มใดกลุ่มหนึ่งไม่ตัดสินชะตาของทั้งพอร์ต',
      ],
      considerations: [
        'การกระจายความเสี่ยงไม่ได้ทำให้ไม่ขาดทุน ในวิกฤตใหญ่หุ้นเกือบทุกตัวลงพร้อมกัน แต่ช่วยให้ไม่เสียหนักจากเหตุการณ์เฉพาะกลุ่ม',
        'การกระจายก็มีราคาที่ต้องจ่าย ถ้าเซกเตอร์ที่เราถือกระจุกไว้เป็นกลุ่มที่ดีที่สุดในปีนั้น พอร์ตที่กระจายจะได้ผลตอบแทนน้อยกว่า',
        'การขายทั้งหมดถือเงินสดอาจหลบขาลงได้ แต่คุณก็ต้องตัดสินใจถูกอีกครั้งว่าจะกลับเข้าตลาดเมื่อไหร่',
      ],
    },
    takeaways: [
      'หุ้นในเซกเตอร์เดียวกันมักขึ้นลงพร้อมกัน',
      'การกระจายหลายเซกเตอร์ช่วยลดความเสียหายจากเหตุการณ์เฉพาะกลุ่ม',
      'กระจายแล้วไม่ได้แปลว่าไม่ขาดทุน แต่พอร์ตจะทนทานกว่า',
    ],
  },
  {
    id: 'ch4',
    number: 4,
    title: 'ความผันผวน ขาดทุนระหว่างทาง และการไม่ตื่นตระหนก',
    concept: 'Volatility · Drawdown · ใจนิ่งตอนตลาดตก',
    start: '2020-01-02',
    decisionDate: '2020-03-16',
    forwardDays: 63,
    startingCash: 500_000,
    companies: [
      { role: 'core', ticker: 'MSFT', sector: 'tech' },
      { role: 'core', ticker: 'AAPL', sector: 'tech' },
      { role: 'core', ticker: 'JNJ', sector: 'healthcare' },
      { role: 'core', ticker: 'JPM', sector: 'finance' },
      { role: 'core', ticker: 'PG', sector: 'consumer' },
      { role: 'core', ticker: 'XOM', sector: 'energy' },
      { role: 'core', ticker: 'CAT', sector: 'industrial' },
      { role: 'core', ticker: 'PLD', sector: 'realestate' },
    ],
    preset: [{ role: 'core', fraction: 0.85 }],
    steps: [
      {
        title: 'ราคาหุ้นแกว่งเป็นเรื่องปกติ',
        text: 'ความผันผวน (Volatility) คือขนาดของการแกว่งขึ้นลงของราคา ส่วน "ขาดทุนจากจุดสูงสุด" (Drawdown) คือพอร์ตลดลงจากจุดที่เคยสูงที่สุดไปเท่าไร คุณมีพอร์ตที่กระจายใน 8 บริษัทอยู่แล้ว (85% ของเงิน) ตรงธงสีชมพูบนหลังคา',
        wait: { kind: 'next' },
        highlight: ['core'],
      },
      {
        title: 'สภาพอากาศคืออารมณ์ตลาด',
        text: 'ดูสภาพอากาศที่มีกรอบสีแดงบน HUD ☀️ คือตลาดขาขึ้น 🌧️ คือขาลง ⛈️ คือร่วงแรง และ 🌫️ คือความไม่แน่นอนสูง ลองสังเกตความรู้สึกตัวเองตอนพายุมาด้วย',
        wait: { kind: 'next' },
        ui: ['weather'],
      },
      {
        title: 'เดินเวลา',
        text: 'กดปุ่มเล่นที่มีกรอบสีแดง แล้วดูว่าพอร์ตกับเมืองเปลี่ยนไปอย่างไร เกมจะหยุดเองเมื่อถึงจุดตัดสินใจ',
        wait: { kind: 'play' },
        ui: ['play'],
      },
    ],
    decision: {
      title: (c) => `พอร์ตของคุณเปลี่ยนไป ${p1(c.change('core', 18))} ในไม่กี่สัปดาห์`,
      prompt: (c) =>
        `ตลาดร่วงหนักและเร็วมาก หุ้นทั้ง 8 ตัวในพอร์ตเปลี่ยนไปเฉลี่ย ${p1(c.change('core', 18))} ในเวลาไม่ถึงเดือน ข่าวทุกช่องน่ากลัว ไม่มีใครรู้ว่าจะจบเมื่อไหร่ คุณมีเงินสดเหลือ ${baht(c.cash)} จะทำอย่างไร?`,
      options: [
        { id: 'sell_all', label: 'ขายทั้งหมด หยุดขาดทุน', detail: () => 'ถือเงินสด 100%', style: 'sell', action: { kind: 'trim_role', role: 'core', fraction: 1 } },
        { id: 'trim', label: 'ขายครึ่งหนึ่ง', detail: () => 'ลดความเสี่ยงลงครึ่งหนึ่ง', style: 'sell', action: { kind: 'trim_role', role: 'core', fraction: 0.5 } },
        { id: 'hold', label: 'ถือต่อตามแผน', detail: () => 'ไม่เปลี่ยนอะไร', style: 'hold', action: { kind: 'hold' } },
        { id: 'buy', label: 'ใช้เงินสดที่เหลือซื้อเพิ่ม', detail: (c) => `ซื้อทั้ง 8 ตัวเท่า ๆ กัน (${baht(c.cash)})`, style: 'buy', action: { kind: 'buy_role', roles: ['core'], cashFraction: 1 } },
      ],
      lesson: (c) => [
        `ในช่วงต่อมา หุ้นทั้ง 8 ตัวเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('core'))} (ดัชนีเมือง ${p1(c.indexReturn)})`,
        'วันที่ตลาดเด้งแรงที่สุดมักอยู่ใกล้กับวันที่ตลาดแย่ที่สุด คนที่ขายหนีตอนตื่นตระหนกจึงมักพลาดช่วงฟื้นตัว',
      ],
      considerations: [
        'การถือต่อเหมาะกับคนที่มีเวลาลงทุนยาวและไม่ต้องใช้เงินก้อนนี้เร็ว ๆ นี้',
        'ถ้าพอร์ตลงจนนอนไม่หลับ แปลว่าพอร์ตเสี่ยงเกินไปสำหรับคุณ ควรปรับตอนตลาดสงบแล้ว',
        'บางวิกฤตก็ใช้เวลาฟื้นเป็นปี การมีเงินสำรองฉุกเฉินแยกไว้ช่วยให้ไม่ต้องขายหุ้นตอนราคาต่ำ',
      ],
    },
    takeaways: [
      'ราคาหุ้นแกว่งเป็นเรื่องปกติ ตลาดลง 10–30% เกิดขึ้นได้เป็นระยะ',
      'การขายเพราะตกใจมักเกิดใกล้จุดต่ำสุด และทำให้พลาดช่วงฟื้นตัว',
      'เตรียมแผนไว้ก่อนพายุมา: เงินสำรอง สัดส่วนความเสี่ยง และกฎที่ตั้งไว้กับตัวเอง',
    ],
  },
  {
    id: 'ch5',
    number: 5,
    title: 'ทยอยลงทุน (DCA) vs ลงทุนก้อนเดียว',
    concept: 'Dollar-Cost Averaging · Lump Sum · การจับจังหวะ',
    start: '2021-11-15',
    decisionDate: '2021-12-31',
    forwardDays: 63,
    startingCash: 300_000,
    companies: [
      { role: 'core', ticker: 'MSFT', sector: 'tech' },
      { role: 'core', ticker: 'AAPL', sector: 'tech' },
      { role: 'core', ticker: 'JNJ', sector: 'healthcare' },
      { role: 'core', ticker: 'JPM', sector: 'finance' },
      { role: 'core', ticker: 'PG', sector: 'consumer' },
      { role: 'core', ticker: 'HD', sector: 'consumer' },
      { role: 'core', ticker: 'CAT', sector: 'industrial' },
      { role: 'core', ticker: 'XOM', sector: 'energy' },
    ],
    steps: [
      {
        title: 'มีเงินก้อน ควรลงทีเดียวหรือทยอยลง?',
        text: 'การลงทุนก้อนเดียว (Lump Sum) คือการใส่เงินทั้งหมดทันที ส่วนการทยอยลงทุน (DCA) คือการแบ่งเงินเป็นงวดเท่า ๆ กัน แล้วลงทุนตามเวลาที่กำหนด โดยไม่สนว่าราคาเป็นอย่างไร ตอนราคาต่ำ เงินเท่าเดิมจะซื้อหุ้นได้มากขึ้นเอง',
        wait: { kind: 'next' },
      },
      {
        title: 'ข้อดีและข้อเสีย',
        text: 'ถ้าตลาดขาขึ้น การลงทุนก้อนเดียวมักชนะ เพราะเงินได้ทำงานเร็วกว่า ในอดีตลงทุนก้อนเดียวชนะราว 2 ใน 3 ของเวลา แต่ DCA ลดความเสี่ยงที่จะลงทุนทั้งหมดตรงจุดสูงสุดพอดี และช่วยให้ใจสงบกว่า กดเล่นเพื่อไปถึงวันที่ต้องตัดสินใจ',
        wait: { kind: 'play' },
        ui: ['play'],
      },
    ],
    decision: {
      title: () => 'สิ้นปี: จะลงเงินก้อนนี้อย่างไร?',
      prompt: (c) =>
        `คุณมีเงินสด ${baht(c.cash)} ช่วงที่ผ่านมาหุ้นทั้ง 8 ตัวเปลี่ยนไปเฉลี่ย ${p1(c.change('core', 30))} ใน 6 สัปดาห์ จะลงทุนแบบไหน?`,
      options: [
        { id: 'lump', label: 'ลงทุนก้อนเดียวตอนนี้', detail: () => 'ใช้เงิน 95% ซื้อทั้ง 8 ตัวทันที', style: 'buy', action: { kind: 'buy_role', roles: ['core'], cashFraction: 0.95 } },
        { id: 'dca', label: 'ทยอยลงทุน 3 งวด', detail: () => 'แบ่งเป็น 3 งวด งวดละเดือน (เกมซื้อให้อัตโนมัติ)', style: 'rebalance', action: { kind: 'dca_role', roles: ['core'], cashFraction: 0.95, parts: 3, everyDays: 21 } },
        { id: 'cash', label: 'รอดูสถานการณ์ก่อน', detail: () => 'ยังไม่ลงทุน', style: 'hold', action: { kind: 'hold' } },
      ],
      lesson: (c) => [
        `ในช่วงต่อมา หุ้นทั้ง 8 ตัวเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('core'))} (ดัชนีเมือง ${p1(c.indexReturn)})`,
        'ถ้าตลาดลงหลังจากเริ่มลงทุน DCA จะได้เปรียบ เพราะงวดหลัง ๆ ซื้อได้ในราคาที่ถูกลง แต่ถ้าตลาดขึ้นต่อเนื่อง การลงก้อนเดียวจะได้มากกว่า',
      ],
      considerations: [
        'ในระยะยาว ตลาดขึ้นบ่อยกว่าลง สถิติการลงทุนก้อนเดียวจึงชนะ DCA ในหลายช่วงเวลา',
        'DCA เหมาะมากกับรายได้ที่เข้ามาเป็นงวด ๆ เช่น เงินเดือน และช่วยลดความกลัวที่จะซื้อผิดจังหวะ',
        'การรอ "จังหวะที่ดีกว่า" โดยไม่มีแผน มักจบลงด้วยการไม่ได้ลงทุนเลย',
      ],
    },
    takeaways: [
      'Lump Sum ทำให้เงินทำงานเร็วกว่า ส่วน DCA ลดความเสี่ยงเรื่องจังหวะ',
      'ไม่มีวิธีไหนชนะทุกครั้ง ขึ้นอยู่กับว่าตลาดจะไปทางไหนหลังจากนั้น',
      'การลงทุนสม่ำเสมอตามแผน สำคัญกว่าการหาจังหวะที่สมบูรณ์แบบ',
    ],
  },
  {
    id: 'ch6',
    number: 6,
    title: 'ฟองสบู่และความกลัวตกรถ (FOMO)',
    concept: 'Bubble · FOMO · เรื่องเล่ากับราคา',
    start: '2021-05-03',
    decisionDate: '2021-08-09',
    forwardDays: 63,
    startingCash: 200_000,
    companies: [
      { role: 'hot', ticker: 'MRNA', sector: 'healthcare' },
      { role: 'other', ticker: 'JNJ', sector: 'healthcare' },
      { role: 'other', ticker: 'PFE', sector: 'healthcare' },
      { role: 'other', ticker: 'MSFT', sector: 'tech' },
      { role: 'other', ticker: 'KO', sector: 'consumer' },
      { role: 'other', ticker: 'JPM', sector: 'finance' },
      { role: 'other', ticker: 'XOM', sector: 'energy' },
      { role: 'other', ticker: 'CAT', sector: 'industrial' },
    ],
    steps: [
      {
        title: 'เมื่อทุกคนพูดถึงหุ้นตัวเดียว',
        text: 'ฟองสบู่เกิดขึ้นเมื่อราคาวิ่งเร็วกว่าคุณค่าที่แท้จริงไปมาก เพราะคนซื้อด้วยความหวังว่าจะมีคนมาซื้อต่อในราคาที่แพงกว่า FOMO (Fear Of Missing Out) คือความกลัวตกรถที่ทำให้เราไล่ซื้อของที่ขึ้นมาแล้ว',
        wait: { kind: 'next' },
      },
      {
        title: 'ดูหุ้นที่กำลังร้อนแรง',
        text: 'คลิกตึกที่มีกรอบสีแดง แล้วดูกราฟกับ P/E ของมัน ระหว่างที่เวลาเดิน ลองสังเกตว่าตึกนี้โตเร็วแค่ไหน และสภาพอากาศเปลี่ยนเป็นอย่างไร',
        wait: { kind: 'select', role: 'hot' },
        highlight: ['hot'],
      },
      {
        title: 'เดินเวลา',
        text: 'กดปุ่มเล่นที่มีกรอบสีแดง เกมจะหยุดเมื่อต้องตัดสินใจ',
        wait: { kind: 'play' },
        ui: ['play'],
      },
    ],
    decision: {
      title: (c) => `${c.name('hot')} เปลี่ยนไป ${p1(c.change('hot', 63))} ใน 3 เดือน`,
      prompt: (c) =>
        `ทุกคนพูดถึง ${c.name('hot')} ราคาเปลี่ยนไป ${p1(c.change('hot', 63))} ใน 3 เดือน และ ${p1(c.change('hot', 10))} ใน 2 สัปดาห์ล่าสุด เพื่อนคุณบอกว่า "ยังไม่สายเกินไป" จะทำอย่างไร?`,
      options: [
        { id: 'all_in', label: 'ทุ่มซื้อ 60% ของเงิน', detail: (c) => `ใช้เงินราว ${baht(c.cash * 0.6)}`, style: 'buy', action: { kind: 'buy_role', roles: ['hot'], cashFraction: 0.6 } },
        { id: 'small', label: 'ซื้อเล็ก ๆ 10%', detail: (c) => `ใช้เงินราว ${baht(c.cash * 0.1)} เผื่อผิด`, style: 'rebalance', action: { kind: 'buy_role', roles: ['hot'], cashFraction: 0.1 } },
        { id: 'skip', label: 'ไม่ไล่ซื้อ', detail: () => 'ปล่อยผ่านไป', style: 'hold', action: { kind: 'hold' } },
      ],
      lesson: (c) => [
        `ในช่วงต่อมา ${c.name('hot')} เปลี่ยนไป ${p1(c.roleReturn('hot'))} (ดัชนีเมือง ${p1(c.indexReturn)})`,
        'หุ้นที่ขึ้นแรงเพราะกระแสมักผันผวนสูงมากทั้งขาขึ้นและขาลง ยิ่งราคาห่างจากกำไรจริงมาก ก็ยิ่งเปราะบางต่อข่าวผิดหวัง',
      ],
      considerations: [
        'บางกระแสเป็นของจริงและขึ้นต่อได้อีกนาน การไม่ซื้อเลยก็มีต้นทุน',
        'ถ้าจะซื้อตามกระแส การจำกัดขนาดไว้เล็ก ๆ ทำให้ผิดได้โดยไม่เจ็บหนัก',
        'สัญญาณฟองสบู่: ทุกคนพูดถึง คนที่ไม่เคยลงทุนเริ่มเข้ามา และเหตุผลที่ใช้คือ "ราคากำลังขึ้น"',
      ],
    },
    takeaways: [
      'ราคาที่ขึ้นแรงไม่ใช่เหตุผลในการซื้อ ต้องดูว่าคุณค่าโตตามทันไหม',
      'FOMO ทำให้เราซื้อแพงและขายถูก ให้กำหนดขนาดการเดิมพันไว้ก่อนเสมอ',
      'การพลาดโอกาสบางครั้ง ดีกว่าการเสียเงินก้อนใหญ่',
    ],
  },
  {
    id: 'ch7',
    number: 7,
    title: 'ดอกเบี้ยและเศรษฐกิจมหภาค',
    concept: 'อัตราดอกเบี้ย · เงินเฟ้อ · หุ้นที่ไวต่อดอกเบี้ย',
    start: '2021-12-01',
    decisionDate: '2022-03-16',
    forwardDays: 63,
    startingCash: 300_000,
    companies: [
      { role: 'rate_sensitive', ticker: 'ADBE', sector: 'tech' },
      { role: 'rate_sensitive', ticker: 'CRM', sector: 'tech' },
      { role: 'rate_sensitive', ticker: 'PLD', sector: 'realestate' },
      { role: 'rate_sensitive', ticker: 'AMT', sector: 'realestate' },
      { role: 'winner', ticker: 'XOM', sector: 'energy' },
      { role: 'winner', ticker: 'CVX', sector: 'energy' },
      { role: 'other', ticker: 'JPM', sector: 'finance' },
      { role: 'other', ticker: 'KO', sector: 'consumer' },
    ],
    preset: [{ role: 'rate_sensitive', fraction: 0.8 }],
    steps: [
      {
        title: 'ดอกเบี้ยคือราคาของเงิน',
        text: 'เมื่อธนาคารกลางขึ้นดอกเบี้ย เงินฝากกับพันธบัตรจะน่าสนใจขึ้น บริษัทกู้เงินแพงขึ้น และกำไรในอนาคตไกล ๆ มีมูลค่าในวันนี้น้อยลง หุ้นเติบโตที่ราคาแพงกับ REIT ที่กู้เงินเยอะจึงมักไวต่อดอกเบี้ยเป็นพิเศษ',
        wait: { kind: 'next' },
      },
      {
        title: 'พอร์ตของคุณ',
        text: 'คุณถือหุ้นเทคโนโลยีและ REIT ที่ไวต่อดอกเบี้ยอยู่ 80% (ตึกที่มีกรอบสีแดง) ส่วนหุ้นพลังงานมักได้ประโยชน์เมื่อเงินเฟ้อสูง กดเล่นเพื่อเดินเวลา',
        wait: { kind: 'play' },
        highlight: ['rate_sensitive'],
        ui: ['play'],
      },
    ],
    decision: {
      title: () => 'ธนาคารกลางเริ่มขึ้นดอกเบี้ยครั้งแรกในรอบหลายปี',
      prompt: (c) =>
        `เงินเฟ้อพุ่งสูงที่สุดในรอบหลายสิบปี ธนาคารกลางเริ่มขึ้นดอกเบี้ย และส่งสัญญาณว่าจะขึ้นอีกหลายครั้ง หุ้นที่ไวต่อดอกเบี้ยในพอร์ต (${pct(c.weight('rate_sensitive'), 0, false)}) เปลี่ยนไป ${p1(c.change('rate_sensitive', 60))} ใน 3 เดือน ส่วนหุ้นพลังงานเปลี่ยนไป ${p1(c.change('winner', 60))} จะปรับพอร์ตไหม?`,
      options: [
        { id: 'hold', label: 'ถือตามเดิม', detail: () => 'ราคาสะท้อนข่าวไปแล้วบางส่วน', style: 'hold', action: { kind: 'hold' } },
        { id: 'rotate', label: 'ย้ายครึ่งหนึ่งไปหุ้นพลังงาน', detail: () => 'ขายหุ้นไวต่อดอกเบี้ย 50% แล้วซื้อหุ้นพลังงาน', style: 'rebalance', action: { kind: 'rotate_role', sellRole: 'rate_sensitive', sellFraction: 0.5, buyRoles: ['winner'] } },
        { id: 'cash', label: 'ลดเหลือครึ่งเดียว ถือเงินสด', detail: () => 'ขาย 50% ถือเงินสด', style: 'sell', action: { kind: 'trim_role', role: 'rate_sensitive', fraction: 0.5 } },
      ],
      lesson: (c) => [
        `ในช่วงต่อมา หุ้นที่ไวต่อดอกเบี้ยเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('rate_sensitive'))} ส่วนหุ้นพลังงานเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('winner'))} (ดัชนีเมือง ${p1(c.indexReturn)})`,
        'ดอกเบี้ยเป็นเหมือนแรงโน้มถ่วงของราคาสินทรัพย์ ยิ่งดอกเบี้ยสูง มูลค่าของกำไรในอนาคตก็ยิ่งถูกดึงลง',
      ],
      considerations: [
        'ตลาดมักคาดการณ์ล่วงหน้า ราคาอาจสะท้อนการขึ้นดอกเบี้ยไปแล้วบางส่วนก่อนที่ธนาคารกลางจะประกาศ',
        'เมื่อวัฏจักรกลับทางและดอกเบี้ยเริ่มลง หุ้นกลุ่มที่เคยโดนหนักมักฟื้นแรง',
        'การเดาภาพมหภาคให้ถูกทั้งทิศทางและจังหวะนั้นยากมาก การกระจายหลายกลุ่มช่วยไม่ให้พอร์ตพึ่งการเดาครั้งเดียว',
      ],
    },
    takeaways: [
      'ดอกเบี้ยขึ้นกดดันหุ้นเติบโตราคาแพงและธุรกิจที่กู้เงินมาก',
      'เงินเฟ้อสูงอาจเป็นประโยชน์กับบางกลุ่ม เช่น พลังงานและสินค้าโภคภัณฑ์',
      'มหภาคสำคัญ แต่ต้องคาดการณ์ทั้งทิศทางและจังหวะให้ถูก ซึ่งยาก จึงควรกระจาย',
    ],
  },
  {
    id: 'ch8',
    number: 8,
    title: 'พอร์ตแกนหลักและดาวเทียม (Core–Satellite)',
    concept: 'Core–Satellite · ขนาดของความเสี่ยง · แผนที่ทำตามได้จริง',
    start: '2023-01-03',
    decisionDate: '2023-01-31',
    forwardDays: 63,
    startingCash: 400_000,
    companies: [
      { role: 'core', ticker: 'MSFT', sector: 'tech' },
      { role: 'core', ticker: 'JNJ', sector: 'healthcare' },
      { role: 'core', ticker: 'JPM', sector: 'finance' },
      { role: 'core', ticker: 'PG', sector: 'consumer' },
      { role: 'core', ticker: 'XOM', sector: 'energy' },
      { role: 'core', ticker: 'CAT', sector: 'industrial' },
      { role: 'core', ticker: 'PLD', sector: 'realestate' },
      { role: 'satellite', ticker: 'NVDA', sector: 'tech' },
      { role: 'satellite', ticker: 'AMD', sector: 'tech' },
      { role: 'satellite', ticker: 'TSLA', sector: 'consumer' },
    ],
    steps: [
      {
        title: 'แกนหลักกับดาวเทียม',
        text: 'พอร์ต Core–Satellite แบ่งเป็นสองส่วน ส่วนแกนหลัก (Core) ราว 70–90% คือหุ้นหลายตัวที่กระจายทุกเซกเตอร์ ถือยาว และปรับน้อย ส่วนดาวเทียม (Satellite) ราว 10–30% คือหุ้นที่คุณมั่นใจหรืออยากลองเสี่ยง ถ้าดาวเทียมพัง แกนหลักยังพยุงพอร์ตไว้ได้',
        wait: { kind: 'next' },
      },
      {
        title: 'ดาวเทียม: หุ้นที่น่าตื่นเต้น',
        text: 'คลิกตึกดาวเทียมที่มีกรอบสีแดง แล้วดูว่าราคาผันผวนแค่ไหนเมื่อเทียบกับหุ้นทั่วไป',
        wait: { kind: 'select', role: 'satellite' },
        highlight: ['satellite'],
      },
      {
        title: 'แกนหลัก: หุ้นที่กระจายทุกย่าน',
        text: 'คราวนี้คลิกตึกแกนหลักที่มีกรอบสีแดงสักหลัง หุ้นกลุ่มนี้กระจายอยู่ทุกย่านของเมือง',
        wait: { kind: 'select', role: 'core' },
        highlight: ['core'],
      },
      {
        title: 'เดินเวลา',
        text: 'กดปุ่มเล่นที่มีกรอบสีแดง แล้วคุณจะได้เลือกโครงสร้างพอร์ตของตัวเอง',
        wait: { kind: 'play' },
        ui: ['play'],
      },
    ],
    decision: {
      title: () => 'ถึงเวลาจัดพอร์ตของคุณเอง',
      prompt: (c) =>
        `คุณมีเงินสด ${baht(c.cash)} หุ้นดาวเทียมเปลี่ยนไปเฉลี่ย ${p1(c.change('satellite', 20))} ในเดือนที่ผ่านมา ส่วนหุ้นแกนหลักเปลี่ยนไป ${p1(c.change('core', 20))} จะจัดพอร์ตแบบไหน?`,
      options: [
        { id: 'core', label: 'แกนหลักล้วน', detail: () => 'ใช้เงิน 95% กระจาย 7 ตัวทุกเซกเตอร์', style: 'hold', action: { kind: 'buy_role', roles: ['core'], cashFraction: 0.95 } },
        { id: 'core_sat', label: 'แกนหลัก 80% + ดาวเทียม 20%', detail: () => 'สมดุลระหว่างความมั่นคงกับโอกาส', style: 'rebalance', action: { kind: 'mix', parts: [{ roles: ['core'], cashFraction: 0.76 }, { roles: ['satellite'], cashFraction: 0.19 }] } },
        { id: 'sat', label: 'ดาวเทียมล้วน', detail: () => 'ใช้เงิน 95% ซื้อหุ้นดาวรุ่ง 3 ตัว', style: 'buy', action: { kind: 'buy_role', roles: ['satellite'], cashFraction: 0.95 } },
      ],
      lesson: (c) => [
        `ในช่วงต่อมา หุ้นแกนหลักเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('core'))} ส่วนหุ้นดาวเทียมเปลี่ยนไปเฉลี่ย ${p1(c.roleReturn('satellite'))} (ดัชนีเมือง ${p1(c.indexReturn)})`,
        'Core–Satellite ไม่ได้ให้ผลตอบแทนสูงสุดในทุกช่วง แต่เป็นแผนที่คนส่วนใหญ่ทำตามได้จริง ทั้งตอนตลาดดีและตอนตลาดร้าย',
      ],
      considerations: [
        'ถ้าดาวเทียมพุ่ง พอร์ตดาวเทียมล้วนจะชนะขาดในช่วงนั้น แต่ถ้าดิ่งก็จะเจ็บหนักที่สุดเช่นกัน',
        'สัดส่วนดาวเทียมควรเล็กพอที่ถ้าหายไปครึ่งหนึ่ง คุณยังรับไหวและไม่ทิ้งแผน',
        'ปรับสมดุลปีละ 1–2 ครั้ง เพื่อไม่ให้ดาวเทียมโตจนกลายเป็นแกนหลักโดยไม่รู้ตัว',
      ],
    },
    takeaways: [
      'แกนหลักที่กระจายดีคือฐานของพอร์ต ส่วนดาวเทียมคือพื้นที่ให้ความมั่นใจและความเสี่ยงที่ควบคุมได้',
      'ขนาดของการเดิมพันสำคัญพอ ๆ กับการเลือกหุ้น',
      'แผนที่ดีคือแผนที่คุณทำตามได้จริงในวันที่ตลาดแย่ที่สุด',
    ],
  },
];

export function chapterById(id: string): ChapterDef | undefined {
  return CHAPTERS.find((c) => c.id === id);
}
