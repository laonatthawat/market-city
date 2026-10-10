import { annualizedVol, changeOver } from './indicators';

/** City-wide weather = market sentiment. */
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'golden';

export interface WeatherReading {
  weather: Weather;
  /** 0..100 fear → greed, also used by the HUD gauge. */
  score: number;
  drawdown: number;
  r20: number;
  vol: number;
}

export const WEATHER_LABEL: Record<Weather, { icon: string; th: string; hint: string }> = {
  sunny: { icon: '☀️', th: 'แดดใส', hint: 'ตลาดขาขึ้น นักลงทุนมั่นใจ' },
  cloudy: { icon: '⛅', th: 'เมฆครึ้ม', hint: 'ตลาดทรงตัว ไม่มีทิศทางชัด' },
  rain: { icon: '🌧️', th: 'ฝนตก', hint: 'ตลาดขาลง นักลงทุนกังวล' },
  storm: { icon: '⛈️', th: 'พายุ', hint: 'ตลาดร่วงแรง ความกลัวสูงสุด' },
  fog: { icon: '🌫️', th: 'หมอกลง', hint: 'ความไม่แน่นอนสูง ราคาเหวี่ยงแรง' },
  golden: { icon: '✨', th: 'แสงทอง', hint: 'ตลาดคึกคักมาก ระวังความโลภและฟองสบู่' },
};

/**
 * Classify the market from city-index closes (oldest → newest, ideally ~1 year).
 * Thresholds are deliberately simple and documented for players.
 */
export function readWeather(closes: readonly number[]): WeatherReading {
  const last = closes[closes.length - 1] ?? 0;
  const hi = Math.max(...closes.slice(-252));
  const drawdown = hi > 0 ? 1 - last / hi : 0;
  const r5 = changeOver(closes, 5) ?? 0;
  const r20 = changeOver(closes, 20) ?? 0;
  const r126 = changeOver(closes, 126) ?? 0;
  const vol = annualizedVol(closes, 20) ?? 0;
  const score = Math.max(0, Math.min(100, 55 + r20 * 380 - drawdown * 160));

  let weather: Weather;
  if ((drawdown > 0.15 && r20 < -0.08) || r5 < -0.07) weather = 'storm';
  else if (drawdown > 0.1 || r20 < -0.04) weather = 'rain';
  else if (vol > 0.3) weather = 'fog';
  else if (r126 > 0.18 && drawdown < 0.03 && r20 > 0.02) weather = 'golden';
  else if (r20 > 0.01) weather = 'sunny';
  else weather = 'cloudy';
  return { weather, score, drawdown, r20, vol };
}
