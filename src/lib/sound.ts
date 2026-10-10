/**
 * Tiny synthesized sound kit (WebAudio, no asset files).
 * Browsers only allow audio after a user gesture, so the context is created lazily on first use.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let rainGain: GainNode | null = null;
let enabled = true;

/** The shared AudioContext (created on demand), regardless of whether effects are enabled. */
export function audioContext(): AudioContext | null {
  if (!ctx) {
    const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.22 : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function audio(): AudioContext | null {
  return enabled ? audioContext() : null;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (master) master.gain.value = on ? 0.22 : 0;
  if (!on) setRain(0);
}

/** Call from any user gesture so later sounds are allowed to play. */
export function unlockAudio() {
  audioContext();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.6, endFreq?: number) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noiseBuffer(a: AudioContext, seconds: number): AudioBuffer {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noise(dur: number, filter: BiquadFilterType, freq: number, vol: number, endFreq?: number, start = 0) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + start;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, dur);
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  buy: () => tone(520, 0, 0.12, 'triangle', 0.4, 780),
  sell: () => tone(620, 0, 0.12, 'triangle', 0.4, 400),
  coin: () => {
    tone(988, 0, 0.09, 'square', 0.18);
    tone(1319, 0.07, 0.25, 'square', 0.18);
  },
  alert: () => {
    tone(660, 0, 0.16, 'triangle', 0.5);
    tone(880, 0.14, 0.24, 'triangle', 0.5);
  },
  whoosh: () => noise(0.5, 'bandpass', 400, 0.5, 2400),
  news: () => {
    tone(784, 0, 0.12, 'sine', 0.35);
    tone(587, 0.12, 0.18, 'sine', 0.35);
  },
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.32, 'triangle', 0.45)),
  thunder: () => {
    noise(1.6, 'lowpass', 900, 0.9, 80, 0.15);
    noise(0.25, 'highpass', 1500, 0.25);
  },
};

/** Continuous rain ambience; level 0..1. */
export function setRain(level: number) {
  if (level > 0 && !rainGain) {
    const a = audio();
    if (!a || !master) return;
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a, 2);
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.4;
    rainGain = a.createGain();
    rainGain.gain.value = 0;
    src.connect(f).connect(rainGain).connect(master);
    src.start();
  }
  if (rainGain && ctx) rainGain.gain.setTargetAtTime(level * 0.35, ctx.currentTime, 0.6);
}
