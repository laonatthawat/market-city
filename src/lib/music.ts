import { audioContext } from './sound';

/**
 * Generative background music (WebAudio, no files): a light, cheerful city-builder groove.
 * Major-key chords (I–V–vi–IV), a soft kalimba arpeggio, a bouncy bass, a few bell notes
 * and a quiet shaker. Bad weather only slows it down and softens it; it never turns gloomy.
 */

export type MusicMood = 'bright' | 'dim';

const VOLUME = 0.08;

interface MoodSettings {
  bpm: number;
  /** Chords as MIDI notes; the first is the bass root. */
  chords: number[][];
  /** Major-pentatonic notes for the melody. */
  bells: number[];
  cutoff: number;
  shaker: boolean;
}

const MOODS: Record<MusicMood, MoodSettings> = {
  bright: {
    bpm: 100,
    chords: [
      [48, 60, 64, 67, 74], // C(add9)
      [43, 59, 62, 67, 71], // G
      [45, 60, 64, 69, 71], // Am(add9)
      [41, 60, 65, 69, 72], // F
    ],
    bells: [76, 79, 81, 84, 86, 88],
    cutoff: 5200,
    shaker: true,
  },
  // Rain: same happy key, just calmer.
  dim: {
    bpm: 84,
    chords: [
      [41, 60, 65, 69, 72], // F
      [48, 60, 64, 67, 72], // C
      [43, 59, 62, 67, 74], // G
      [45, 60, 64, 69, 76], // Am
    ],
    bells: [72, 74, 76, 79, 81, 84],
    cutoff: 3200,
    shaker: false,
  },
};

// Arpeggio over chord tones (indices into the chord, skipping the bass), in 8th notes.
const ARP = [1, 2, 3, 2, 4, 3, 2, 3];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

let out: GainNode | null = null;
let wet: ConvolverNode | null = null;
let filter: BiquadFilterNode | null = null;
let noise: AudioBuffer | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let playing = false;
let mood: MusicMood = 'bright';
let bar = 0;
let nextAt = 0;
let lastBell = 2;

function impulse(a: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

function graph(a: AudioContext) {
  if (out) return;
  out = a.createGain();
  out.gain.value = 0;
  out.connect(a.destination);
  filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = MOODS.bright.cutoff;
  filter.connect(out);
  // A small, bright room rather than a dark hall.
  wet = a.createConvolver();
  wet.buffer = impulse(a, 1.4);
  const wetGain = a.createGain();
  wetGain.gain.value = 0.28;
  wet.connect(wetGain).connect(filter);
  noise = a.createBuffer(1, Math.floor(a.sampleRate * 0.1), a.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

interface Voice {
  type: OscillatorType;
  vol: number;
  attack: number;
  /** Seconds until the note has faded (exponential decay), or sustain to `dur` when `hold`. */
  decay: number;
  hold?: boolean;
  wet?: number;
}

function note(a: AudioContext, freq: number, t: number, dur: number, v: Voice) {
  const osc = a.createOscillator();
  osc.type = v.type;
  osc.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v.vol, t + v.attack);
  if (v.hold) {
    g.gain.setValueAtTime(v.vol, t + Math.max(v.attack, dur - v.decay));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
  } else {
    g.gain.exponentialRampToValueAtTime(0.0001, t + v.attack + v.decay);
  }
  osc.connect(g);
  g.connect(filter!);
  if (v.wet) {
    const send = a.createGain();
    send.gain.value = v.wet;
    g.connect(send).connect(wet!);
  }
  const end = t + (v.hold ? dur : v.attack + v.decay) + 0.05;
  osc.start(t);
  osc.stop(end);
}

/** Kalimba / marimba-ish pluck: a sine plus a quieter overtone. */
function pluck(a: AudioContext, midi: number, t: number, vol: number) {
  note(a, hz(midi), t, 0, { type: 'sine', vol, attack: 0.005, decay: 0.55, wet: 0.35 });
  note(a, hz(midi) * 4, t, 0, { type: 'sine', vol: vol * 0.12, attack: 0.003, decay: 0.12 });
}

function shaker(a: AudioContext, t: number, vol: number) {
  const src = a.createBufferSource();
  src.buffer = noise;
  const hp = a.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  src.connect(hp).connect(g).connect(filter!);
  src.start(t);
  src.stop(t + 0.08);
}

function barLength(): number {
  return (60 / MOODS[mood].bpm) * 4;
}

function scheduleBar(a: AudioContext, t: number) {
  const m = MOODS[mood];
  const beat = 60 / m.bpm;
  const chord = m.chords[bar % m.chords.length];
  const len = beat * 4;

  // Warm pad, short attack so it never swells ominously.
  for (const n of chord.slice(1, 4)) note(a, hz(n), t, len + 0.15, { type: 'triangle', vol: 0.045, attack: 0.25, decay: 0.4, hold: true, wet: 0.4 });

  // Bouncy bass: root on 1 and 3, fifth on the "and" of 4.
  const root = chord[0];
  note(a, hz(root), t, 0, { type: 'triangle', vol: 0.28, attack: 0.01, decay: 0.45 });
  note(a, hz(root), t + beat * 2, 0, { type: 'triangle', vol: 0.22, attack: 0.01, decay: 0.45 });
  note(a, hz(root + 7), t + beat * 3.5, 0, { type: 'triangle', vol: 0.16, attack: 0.01, decay: 0.3 });

  // Kalimba arpeggio in 8ths, an octave up, with a little humanised skipping.
  ARP.forEach((idx, i) => {
    if (mood === 'dim' && i % 2) return;
    if (Math.random() < 0.12) return;
    pluck(a, chord[Math.min(idx, chord.length - 1)] + 12, t + i * (beat / 2), 0.07 + (i % 4 === 0 ? 0.02 : 0));
  });

  // A short, stepwise bell melody every other bar.
  if (bar % 2 === 1) {
    const steps = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < steps; i++) {
      lastBell = Math.max(0, Math.min(m.bells.length - 1, lastBell + (Math.random() < 0.5 ? -1 : 1)));
      note(a, hz(m.bells[lastBell]), t + beat * (i + (i ? 0.5 : 0)), 0, { type: 'sine', vol: 0.06, attack: 0.008, decay: 0.9, wet: 0.5 });
    }
  }

  if (m.shaker) for (let i = 0; i < 8; i++) shaker(a, t + i * (beat / 2), i % 2 ? 0.05 : 0.025);
  bar++;
}

function loop() {
  const a = audioContext();
  if (!a || !playing) return;
  // Keep about two bars scheduled so background-tab timer throttling never leaves gaps.
  while (nextAt < a.currentTime + 2 * barLength()) {
    const at = Math.max(nextAt, a.currentTime + 0.05);
    scheduleBar(a, at);
    nextAt = at + barLength();
  }
  timer = setTimeout(loop, 500);
}

/** Start or stop the background music (fades in and out). Needs a prior user gesture. */
export function setMusic(on: boolean) {
  const a = audioContext();
  if (!a) return;
  graph(a);
  if (on === playing) return;
  playing = on;
  out!.gain.cancelScheduledValues(a.currentTime);
  out!.gain.setTargetAtTime(on ? VOLUME : 0, a.currentTime, on ? 1 : 0.3);
  if (on) {
    nextAt = a.currentTime + 0.1;
    loop();
  } else if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Switch between the lively and the calmer arrangement; takes effect from the next bar. */
export function setMusicMood(next: MusicMood) {
  if (next === mood) return;
  mood = next;
  bar = 0;
  const a = audioContext();
  if (a && filter) filter.frequency.setTargetAtTime(MOODS[next].cutoff, a.currentTime, 1.5);
}
