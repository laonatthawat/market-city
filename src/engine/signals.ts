import { rsi, sma } from './indicators';

export interface ChartSignal {
  id: string;
  label: string;
  tone: 'up' | 'down' | 'info';
  /** What it means and why it is not a promise. */
  tip: string;
}

/**
 * Plain-language readings of the chart on its latest bar, for the signal helper under the price
 * chart. `closes`/`volumes` include warm-up history; only the last bar is read.
 */
export function chartSignals(closes: readonly number[], volumes: readonly number[]): ChartSignal[] {
  const n = closes.length;
  if (n < 30) return [];
  const out: ChartSignal[] = [];
  const last = closes[n - 1];
  const m50 = sma(closes, 50);
  const m200 = sma(closes, 200);
  const a = m50[n - 1];
  const z = m200[n - 1];

  if (a != null && z != null) {
    if (last > a && a > z) out.push({ id: 'trend', label: 'แนวโน้มขาขึ้น', tone: 'up', tip: 'ราคาอยู่เหนือ MA50 และ MA50 อยู่เหนือ MA200 แนวโน้มที่ผ่านมาเป็นขาขึ้น แต่ไม่ได้รับประกันว่าจะขึ้นต่อ' });
    else if (last < a && a < z) out.push({ id: 'trend', label: 'แนวโน้มขาลง', tone: 'down', tip: 'ราคาอยู่ใต้ MA50 และ MA50 อยู่ใต้ MA200 แนวโน้มที่ผ่านมาเป็นขาลง แต่อาจกลับตัวเมื่อไหร่ก็ได้' });
    else out.push({ id: 'trend', label: 'แนวโน้มไม่ชัด', tone: 'info', tip: 'ราคาและเส้นค่าเฉลี่ยสลับกันไปมา ตลาดอาจกำลังแกว่งตัวหรือเปลี่ยนแนวโน้ม' });
    // A cross within the last 10 bars.
    for (let k = n - 1; k >= Math.max(1, n - 10); k--) {
      const p50 = m50[k - 1];
      const p200 = m200[k - 1];
      const c50 = m50[k];
      const c200 = m200[k];
      if (p50 == null || p200 == null || c50 == null || c200 == null) break;
      if (p50 <= p200 && c50 > c200) {
        out.push({ id: 'cross', label: 'Golden Cross', tone: 'up', tip: `MA50 เพิ่งตัดขึ้นเหนือ MA200 (${n - 1 - k} วันก่อน) สัญญาณนี้มาช้าเสมอ และหลอกได้บ่อยในตลาดแกว่งตัว` });
        break;
      }
      if (p50 >= p200 && c50 < c200) {
        out.push({ id: 'cross', label: 'Death Cross', tone: 'down', tip: `MA50 เพิ่งตัดลงใต้ MA200 (${n - 1 - k} วันก่อน) สัญญาณนี้มาช้าเสมอ บางครั้งเกิดใกล้จุดต่ำสุดพอดี` });
        break;
      }
    }
  } else if (a != null) {
    out.push(last > a ? { id: 'trend', label: 'เหนือ MA50', tone: 'up', tip: 'ราคาอยู่เหนือค่าเฉลี่ย 50 วัน' } : { id: 'trend', label: 'ใต้ MA50', tone: 'down', tip: 'ราคาอยู่ใต้ค่าเฉลี่ย 50 วัน' });
  }

  const r = rsi(closes, 14)[n - 1];
  if (r != null) {
    if (r > 70) out.push({ id: 'rsi', label: `RSI ${Math.round(r)} · ขึ้นแรง`, tone: 'down', tip: 'RSI เกิน 70: ราคาขึ้นแรงผิดปกติช่วงนี้ อาจพักตัว แต่ในขาขึ้นแรง RSI สูงได้นาน' });
    else if (r < 30) out.push({ id: 'rsi', label: `RSI ${Math.round(r)} · ลงแรง`, tone: 'up', tip: 'RSI ต่ำกว่า 30: ราคาลงแรงผิดปกติช่วงนี้ อาจเด้ง แต่ในขาลงแรง RSI ต่ำได้นาน' });
    else out.push({ id: 'rsi', label: `RSI ${Math.round(r)}`, tone: 'info', tip: 'RSI อยู่ระหว่าง 30–70: ไม่ได้ขึ้นหรือลงแรงผิดปกติ' });
  }

  if (volumes.length >= 21) {
    const v = volumes.slice(-21);
    const avg = v.slice(0, 20).reduce((s, x) => s + x, 0) / 20;
    if (avg > 0 && v[20] / avg >= 2) out.push({ id: 'vol', label: `วอลุ่ม ${(v[20] / avg).toFixed(1)} เท่า`, tone: 'info', tip: 'วันนี้ซื้อขายกันมากกว่าค่าเฉลี่ย 20 วันอย่างน้อย 2 เท่า มีคนจำนวนมากเปลี่ยนใจพร้อมกัน ดูว่าราคาไปทางไหนประกอบ' });
  }

  const year = closes.slice(-252);
  if (year.length >= 120) {
    const hi = Math.max(...year);
    const lo = Math.min(...year);
    if (last >= hi * 0.98) out.push({ id: 'range', label: 'ใกล้จุดสูงสุดรอบปี', tone: 'up', tip: 'ราคาอยู่ห่างจุดสูงสุดในรอบ 1 ปีไม่ถึง 2% ระดับนี้มักเป็นแนวต้านทางจิตวิทยา' });
    else if (last <= lo * 1.02) out.push({ id: 'range', label: 'ใกล้จุดต่ำสุดรอบปี', tone: 'down', tip: 'ราคาอยู่ห่างจุดต่ำสุดในรอบ 1 ปีไม่ถึง 2% ระดับนี้มักเป็นแนวรับทางจิตวิทยา' });
  }
  return out;
}
