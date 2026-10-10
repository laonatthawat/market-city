import type { MarketView } from './MarketView';

export interface NewsItem {
  day: number;
  date: string;
  tone: 'good' | 'bad' | 'neutral';
  text: string;
}

const pct = (x: number) => `${Math.abs(x * 100).toFixed(1)}%`;

/** In-game headlines derived only from data up to the current day. */
export function companyNews(view: MarketView, id: string, name: string, max = 12): NewsItem[] {
  const bars = view.history(id, Math.max(view.run.historyStart, view.currentDay - 504));
  if (bars.length < 2) return [];
  const earnings = new Set(view.company(id)?.earningsDays ?? []);
  const out: NewsItem[] = [];
  let lastHigh = -999;
  let lastLow = -999;
  const from = Math.max(1, bars.findIndex((b) => b.day >= view.currentDay - 252));
  for (let i = from; i < bars.length; i++) {
    const b = bars[i];
    const r = b.close / bars[i - 1].close - 1;
    if (earnings.has(b.day)) {
      const text =
        r >= 0.03
          ? `${name} ประกาศผลประกอบการ ราคาหุ้นพุ่ง ${pct(r)} นักลงทุนตอบรับดี`
          : r <= -0.03
            ? `${name} ประกาศผลประกอบการ ราคาหุ้นร่วง ${pct(r)} ตลาดผิดหวัง`
            : `${name} ประกาศผลประกอบการ ราคาเคลื่อนไหวเล็กน้อย (${r >= 0 ? '+' : '−'}${pct(r)})`;
      out.push({ day: b.day, date: b.date, tone: r >= 0.03 ? 'good' : r <= -0.03 ? 'bad' : 'neutral', text });
      continue;
    }
    if (Math.abs(r) >= 0.06) {
      out.push({
        day: b.day,
        date: b.date,
        tone: r > 0 ? 'good' : 'bad',
        text: r > 0 ? `หุ้น ${name} พุ่งแรง ${pct(r)} ในวันเดียว` : `หุ้น ${name} ดิ่ง ${pct(r)} ในวันเดียว`,
      });
    }
    const window = bars.slice(Math.max(0, i - 252), i).map((x) => x.close);
    if (window.length >= 120) {
      if (b.close > Math.max(...window) && i - lastHigh > 20) {
        lastHigh = i;
        out.push({ day: b.day, date: b.date, tone: 'good', text: `${name} ทำราคาสูงสุดใหม่ในรอบ 52 สัปดาห์` });
      } else if (b.close < Math.min(...window) && i - lastLow > 20) {
        lastLow = i;
        out.push({ day: b.day, date: b.date, tone: 'bad', text: `${name} ราคาต่ำสุดในรอบ 52 สัปดาห์` });
      }
    }
  }
  return out.reverse().slice(0, max);
}
