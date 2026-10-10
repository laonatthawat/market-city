import { create } from 'zustand';
import { newAchievements } from '../data/achievements';
import { eventById } from '../data/events';
import { chapterById } from '../data/tutorials';
import { challengeFailure, modifiersKey, ruleViolation } from '../engine/challenges';
import type { RuleContext } from '../engine/challenges';
import { equalPlan, executePlan, isPayday, planTotal } from '../engine/dca';
import type { InvestPlan } from '../engine/dca';
import { applyAction, scheduledParts } from '../engine/decisions/actions';
import { buildDecision, buildOutcome, optionPortfolios, summarize } from '../engine/decisions/build';
import { detectTriggers, maxDecisionsFor, newTracker, pickTrigger, recordTrigger } from '../engine/decisions/triggers';
import type { DecisionTracker } from '../engine/decisions/triggers';
import type { DecisionOutcome, DecisionPoint, DecisionRecord, OptionAction } from '../engine/decisions/types';
import { activeEventAt, buildEventDecision, buildEventOutcome, eventsInRun, resolveEvents } from '../engine/events';
import type { ResolvedEvent } from '../engine/events';
import { MarketView } from '../engine/MarketView';
import { diversificationScore } from '../engine/metrics';
import { buy, createPortfolio, sell, totalValue } from '../engine/portfolio';
import type { Portfolio, TradeError } from '../engine/portfolio';
import { createDefaultProvider, SimulatedProvider } from '../engine/provider';
import type { MarketDataProvider } from '../engine/provider';
import { randomSeed } from '../engine/rng';
import { sampleRun } from '../engine/sampler';
import { buildReport } from '../engine/scoring';
import type { Report } from '../engine/scoring';
import { buildChapterDecision, buildChapterOutcome, resolveChapter } from '../engine/tutorial';
import type { DatasetInfo, Funding, Run, RunModifiers } from '../engine/types';
import { readWeather } from '../engine/weather';
import type { Weather } from '../engine/weather';
import { loadJson, saveJson } from '../lib/storage';

export type Phase = 'boot' | 'menu' | 'loading' | 'playing' | 'ended';
export type Speed = 0 | 1 | 5 | 20;
export type Mode = 'run' | 'tutorial' | 'sandbox';
/** Sub-state while playing. */
export type Flow = 'normal' | 'decision' | 'fastforward' | 'outcome' | 'payday';

/** Milliseconds of real time per trading day at 1x (≈12.6 min per in-game year). */
export const MS_PER_DAY_1X = 3000;
/** DCA runs are longer (3–5 years) so they play faster (≈3.4 min per year at 1x). */
export const MS_PER_DAY_DCA = 800;
/** Playback speed used for the "what happened next" fast-forward. */
export const FAST_FORWARD_SPEED = 40;

export interface EquityPoint {
  day: number;
  value: number;
  /** Benchmark: city index with the same money flows (scaled to the starting cash / DCA contributions). */
  index: number;
  cash: number;
  /** Diversification of holdings that day (0..1). */
  div: number;
  /** Money contributed that day (DCA payday). */
  contrib: number;
}

export interface RunSettings {
  startingCash: number;
  years: number;
  seed?: number;
  funding?: Funding;
  modifiers?: RunModifiers;
}

export interface SandboxSettings extends RunSettings {
  shocksPerYear: number;
}

export interface RunRecord {
  id: string;
  playedAt: string;
  seed: number;
  years: number;
  startingCash: number;
  finalValue: number;
  totalReturn: number;
  indexReturn: number;
  maxDrawdown: number;
  trades: number;
  dataset: string;
  mode?: Mode;
  funding?: 'lump' | 'dca';
  challenge?: string;
  grade?: string;
  score?: number;
  failed?: boolean;
}

export interface BestRecord {
  score: number;
  grade: string;
  totalReturn: number;
  excess: number;
  playedAt: string;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}

export interface Banner {
  id: number;
  text: string;
  kind: 'event' | 'shock';
}

export interface TutorialState {
  chapterId: string;
  roles: Record<string, string[]>;
  decisionDay: number;
  step: number;
  decided: boolean;
}

export interface Progress {
  chapters: string[];
}

export interface DcaState {
  monthly: number;
  plan: InvestPlan;
  auto: boolean;
  skipped: number;
  skippedDays: number[];
  /** Payday prompts shown so far, and when the last one was. */
  asked: number;
  lastAskedDay: number;
  /** Benchmark index units bought with the same money. */
  benchUnits: number;
  /** Contributions invested while the market was ≥10% below its high. */
  dropInvested: { day: number; amount: number }[];
}

export interface Payday {
  day: number;
  amount: number;
  /** Market ≥10% below its 1-year high (the "keep investing?" prompt). */
  inDrop: boolean;
}

interface PendingOutcome {
  dp: DecisionPoint;
  chosenId: string;
  portfolios: Record<string, Portfolio>;
  before: Portfolio;
  endDay: number;
}

interface GameState {
  phase: Phase;
  mode: Mode;
  flow: Flow;
  provider: MarketDataProvider | null;
  runProvider: MarketDataProvider | null;
  dataset: DatasetInfo | null;
  runInfo: DatasetInfo | null;
  view: MarketView | null;
  run: Run | null;
  day: number;
  speed: Speed;
  lastSpeed: Speed;
  portfolio: Portfolio;
  equity: EquityPoint[];
  selectedId: string | null;
  /** Info card for a non-company building: 'bank' or a civic building kind. */
  landmark: string | null;
  hoveredId: string | null;
  focusTick: number;
  focusTarget: string | null;
  homeTick: number;
  /** True while the camera is away from the home view (shows the "back to start" button). */
  cameraAway: boolean;
  theme: 'light' | 'dark';
  /** 'high' = shadows, bloom, tilt-shift; 'low' = lighter rendering for slower machines. */
  graphics: 'high' | 'low';
  sound: boolean;
  /** Ambient background music (separate from sound effects). */
  music: boolean;
  /** Bumped to fire confetti. */
  celebrateTick: number;
  toast: Toast | null;
  banner: Banner | null;
  /** Non-blocking notice after an automatic DCA payday investment. */
  paydayNotice: { id: number; amount: number } | null;
  history: RunRecord[];
  progress: Progress;
  achievements: string[];
  bests: Record<string, BestRecord>;
  error: string | null;

  weather: Weather;
  weatherScore: number;
  goldenDays: number;
  runEvents: ResolvedEvent[];
  firedEventDecisions: string[];
  activeEventId: string | null;

  decision: DecisionPoint | null;
  pending: PendingOutcome | null;
  outcome: DecisionOutcome | null;
  tracker: DecisionTracker;
  decisions: DecisionRecord[];
  scheduled: { day: number; action: OptionAction }[];
  tutorial: TutorialState | null;

  dca: DcaState | null;
  payday: Payday | null;
  challengeFailed: string | null;
  report: Report | null;
  newAchievementIds: string[];


  boot(): Promise<void>;
  startRun(settings: RunSettings): Promise<void>;
  startSandbox(settings: SandboxSettings): Promise<void>;
  startChapter(id: string): Promise<void>;
  tutorialNext(): void;
  advanceDay(): void;
  chooseOption(optionId: string): void;
  /** Close a decision without choosing: no fast-forward, play resumes. */
  skipDecision(): void;
  continueAfterOutcome(): void;
  resolvePayday(choice: 'plan' | 'equal' | 'skip' | 'manual', opts?: { monthly?: number; auto?: boolean }): void;
  setPlan(plan: InvestPlan, auto?: boolean): void;
  setSpeed(speed: Speed): void;
  togglePause(): void;
  select(id: string | null, fly?: boolean): void;
  selectLandmark(id: string | null): void;
  lookAt(id: string): void;
  /** Fly the camera back to the starting overview. */
  cameraHome(): void;
  hover(id: string | null): void;
  trade(side: 'buy' | 'sell', companyId: string, shares: number): boolean;
  finishRun(): void;
  backToMenu(): void;
  toggleTheme(): void;
  setGraphics(g: 'high' | 'low'): void;
  toggleSound(): void;
  toggleMusic(): void;
  celebrate(): void;
  showToast(text: string, tone?: Toast['tone']): void;
  dismissBanner(): void;
  dismissPaydayNotice(): void;
}

const TRADE_ERRORS: Record<TradeError, string> = {
  INVALID_QTY: 'จำนวนหุ้นต้องเป็นจำนวนเต็มมากกว่า 0',
  INVALID_PRICE: 'ไม่มีราคาซื้อขายในวันนี้',
  INSUFFICIENT_CASH: 'เงินสดไม่พอ',
  INSUFFICIENT_SHARES: 'มีหุ้นไม่พอขาย',
};

const EVENT_MOOD_DAYS = 20;

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

const initialTheme: 'light' | 'dark' = loadJson('mc.theme', 'light');
applyTheme(initialTheme);

let toastId = 0;
let bannerId = 0;

const resetPlay = {
  flow: 'normal' as Flow,
  speed: 0 as Speed,
  lastSpeed: 1 as Speed,
  landmark: null as string | null,
  selectedId: null,
  hoveredId: null,
  decision: null,
  pending: null,
  outcome: null,
  decisions: [] as DecisionRecord[],
  scheduled: [] as { day: number; action: OptionAction }[],
  banner: null,
  paydayNotice: null,
  payday: null,
  challengeFailed: null,
  report: null,
  newAchievementIds: [] as string[],
  weather: 'sunny' as Weather,
  weatherScore: 50,
  goldenDays: 0,
  firedEventDecisions: [] as string[],
  activeEventId: null,
};

export function msPerDay(run: Run | null): number {
  return run?.funding?.mode === 'dca' ? MS_PER_DAY_DCA : MS_PER_DAY_1X;
}

function holdingsDiversification(p: Portfolio, view: MarketView): number {
  const values = Object.values(p.holdings).map((h) => h.shares * (view.close(h.companyId) ?? 0));
  return diversificationScore(values) * Math.min(1, values.length / 5);
}

export const useGame = create<GameState>((set, get) => {
  function ruleCtx(payday = false): RuleContext | null {
    const { run, view } = get();
    if (!run || !view) return null;
    return { mods: run.modifiers, day: view.currentDay, windowStart: run.windowStart, companies: view.companies, priceOf: (id) => view.close(id), payday };
  }

  /** Shared setup for runs, sandbox and tutorial chapters. */
  async function beginPlay(
    run: Run,
    mode: Mode,
    provider: MarketDataProvider,
    tutorial: TutorialState | null,
    preset?: (p: Portfolio, view: MarketView) => Portfolio,
  ) {
    await provider.ensureLoaded(run.companyIds);
    const view = new MarketView(provider, run);
    view.setDay(run.windowStart);
    let portfolio = createPortfolio(run.startingCash);
    if (preset) portfolio = preset(portfolio, view);
    const value = totalValue(portfolio, (id) => view.close(id));
    const info = provider.getInfo();
    const runEvents = info.real && mode !== 'tutorial' ? eventsInRun(resolveEvents(provider.getCalendar()), run) : [];
    const idx0 = view.indexBar()?.close ?? 1;
    const dca: DcaState | null =
      run.funding?.mode === 'dca'
        ? { monthly: run.funding.monthly, plan: {}, auto: true, asked: 0, lastAskedDay: -1e9, skipped: 0, skippedDays: [], benchUnits: run.startingCash / idx0, dropInvested: [] }
        : null;
    const closes = Array.from(view.indexCloses(run.windowStart - 260));
    const reading = readWeather(closes);
    set({
      ...resetPlay,
      phase: 'playing',
      mode,
      run,
      view,
      runProvider: provider,
      runInfo: info,
      day: run.windowStart,
      portfolio,
      equity: [{ day: run.windowStart, value, index: run.startingCash, cash: portfolio.cash, div: holdingsDiversification(portfolio, view), contrib: 0 }],
      tracker: newTracker(),
      tutorial,
      dca,
      runEvents,
      weather: reading.weather,
      weatherScore: reading.score,
      homeTick: get().homeTick + 1,
    });
  }

  function openDecision(dp: DecisionPoint) {
    const tracker = recordTrigger(get().tracker, dp.key, dp.day);
    const { portfolio, view } = get();
    const ctx = ruleCtx();
    // Challenge rules can remove options (e.g. no selling in the first months).
    if (ctx && view) {
      dp = { ...dp, options: dp.options.filter((o) => !ruleViolation(portfolio, applyAction(portfolio, o.action, (id) => view.close(id), dp.day), ctx)) };
    }
    if (dp.options.length < 2) {
      set({ tracker });
      return;
    }
    set({ decision: dp, flow: 'decision', speed: 0, tracker, selectedId: dp.companyId ?? get().selectedId });
  }

  function finalizeOutcome() {
    const { pending, view, run, mode, tutorial, decisions } = get();
    if (!pending || !view || !run) return;
    const { dp, chosenId, portfolios, before } = pending;
    let outcome: DecisionOutcome;
    if (mode === 'tutorial' && tutorial) {
      const def = chapterById(tutorial.chapterId)!;
      outcome = buildChapterOutcome(def, dp, chosenId, portfolios, view, tutorial.roles, run.disguisedNames, before);
    } else if (dp.type === 'event') {
      outcome = buildEventOutcome(dp, chosenId, portfolios, view);
    } else {
      outcome = buildOutcome(dp, chosenId, portfolios, view, run.disguisedNames);
    }
    const { chosen, best } = summarize(outcome.outcomes, chosenId);
    const record: DecisionRecord = {
      day: dp.day,
      type: dp.type,
      title: dp.title,
      chosenLabel: chosen.label,
      chosenReturn: chosen.ret,
      bestLabel: best.label,
      bestReturn: best.ret,
    };
    set({ outcome, pending: null, flow: 'outcome', speed: 0, decisions: [...decisions, record] });
  }

  function awardAchievements(ids: string[]) {
    if (ids.length === 0) return;
    const achievements = [...get().achievements, ...ids];
    saveJson('mc.achievements', achievements);
    set({ achievements, newAchievementIds: ids });
    get().celebrate();
  }

  function endOfWindow() {
    const { mode, tutorial, progress } = get();
    if (mode === 'tutorial' && tutorial) {
      const chapters = progress.chapters.includes(tutorial.chapterId) ? progress.chapters : [...progress.chapters, tutorial.chapterId];
      const next = { chapters };
      saveJson('mc.progress', next);
      set({ phase: 'ended', speed: 0, selectedId: null, progress: next, flow: 'normal', newAchievementIds: [] });
      get().celebrate();
      awardAchievements(
        newAchievements(
          { kind: 'chapter', challenge: false, challengeFailed: false, hadTaggedEvent: false, goldenDays: 0, skippedPaydays: 0, dividendYield: 0, chaptersDone: chapters.length, runsPlayed: get().history.length },
          get().achievements,
        ),
      );
    } else {
      get().finishRun();
    }
  }

  function bannerFor(text: string, kind: Banner['kind']) {
    set({ banner: { id: ++bannerId, text, kind } });
  }

  /** Weather, tagged events and shock headlines for the new day. */
  function updateWorld(view: MarketView, run: Run, day: number) {
    const { runEvents, activeEventId, goldenDays } = get();
    const reading = readWeather(Array.from(view.indexCloses(day - 260)));
    let weather = reading.weather;
    const ev = activeEventAt(runEvents, day);
    if (ev && day - ev.startDay < EVENT_MOOD_DAYS) weather = ev.tag.mood;
    const patch: Partial<GameState> = { weather, weatherScore: reading.score, goldenDays: goldenDays + (weather === 'golden' ? 1 : 0) };
    if (ev && ev.tag.id !== activeEventId) {
      patch.activeEventId = ev.tag.id;
      bannerFor(ev.tag.headlines[0], 'event');
    } else if (ev) {
      // Rotate the event's headlines every few weeks while it is fresh.
      const k = Math.floor((day - ev.startDay) / 15);
      if ((day - ev.startDay) % 15 === 0 && k > 0 && k < ev.tag.headlines.length) bannerFor(ev.tag.headlines[k], 'event');
    } else if (activeEventId) {
      patch.activeEventId = null;
    }
    for (const e of view.events(day, day)) {
      if (e.kind === 'shock' && e.headline) bannerFor(e.headline.replace('{company}', e.companyId ? run.disguisedNames[e.companyId] ?? 'บริษัทหนึ่ง' : 'บริษัทหนึ่ง'), 'shock');
    }
    set(patch);
  }

  /** Pending hand-written event decision for today (takes priority over generic triggers). */
  function dueEventDecision(day: number) {
    const { runEvents, firedEventDecisions, run } = get();
    if (!run) return null;
    for (const ev of runEvents) {
      for (const d of ev.decisions) {
        if (firedEventDecisions.includes(d.def.id)) continue;
        if (d.day < run.windowStart + 3 || d.day > run.windowEnd - 10) continue;
        if (day >= d.day && day - d.day < 5) return { ev, d };
      }
    }
    return null;
  }

  function eventDecisionSoon(day: number): boolean {
    const { runEvents, firedEventDecisions } = get();
    return runEvents.some((ev) => ev.decisions.some((d) => !firedEventDecisions.includes(d.def.id) && d.day >= day && d.day - day <= 15));
  }

  return {
    phase: 'boot',
    mode: 'run',
    flow: 'normal',
    provider: null,
    runProvider: null,
    dataset: null,
    runInfo: null,
    view: null,
    run: null,
    day: 0,
    speed: 0,
    lastSpeed: 1,
    portfolio: createPortfolio(0),
    equity: [],
    selectedId: null,
    landmark: null,
    hoveredId: null,
    focusTick: 0,
    focusTarget: null,
    homeTick: 0,
    cameraAway: false,
    theme: initialTheme,
    graphics: loadJson<'high' | 'low'>('mc.graphics', 'high'),
    sound: loadJson('mc.sound', true),
    music: loadJson('mc.music', true),
    celebrateTick: 0,
    toast: null,
    banner: null,
    paydayNotice: null,
    history: loadJson<RunRecord[]>('mc.history', []),
    progress: loadJson<Progress>('mc.progress', { chapters: [] }),
    achievements: loadJson<string[]>('mc.achievements', []),
    bests: loadJson<Record<string, BestRecord>>('mc.bests', {}),
    error: null,
    weather: 'sunny',
    weatherScore: 50,
    goldenDays: 0,
    runEvents: [],
    firedEventDecisions: [],
    activeEventId: null,
    decision: null,
    pending: null,
    outcome: null,
    tracker: newTracker(),
    decisions: [],
    scheduled: [],
    tutorial: null,
    dca: null,
    payday: null,
    challengeFailed: null,
    report: null,
    newAchievementIds: [],

    async boot() {
      if (get().provider) return;
      try {
        const provider = await createDefaultProvider();
        set({ provider, dataset: provider.getInfo(), phase: 'menu' });
      } catch (e) {
        set({ error: String(e), phase: 'menu' });
      }
    },

    async startRun({ startingCash, years, seed, funding, modifiers }) {
      const provider = get().provider;
      if (!provider) return;
      set({ phase: 'loading', error: null });
      try {
        const real = provider.getInfo().real;
        const run = sampleRun({
          seed: seed ?? randomSeed(),
          calendarLength: provider.getCalendar().length,
          companies: provider.getCompanies(),
          years,
          startingCash,
          events: real ? resolveEvents(provider.getCalendar()).map((e) => ({ id: e.tag.id, startDay: e.startDay })) : [],
        });
        run.funding = funding ?? { mode: 'lump', monthly: 0 };
        run.modifiers = modifiers ?? {};
        await beginPlay(run, 'run', provider, null);
      } catch (e) {
        set({ phase: 'menu', error: `เริ่มเกมไม่สำเร็จ: ${String(e)}` });
      }
    },

    async startSandbox({ startingCash, years, seed, shocksPerYear, funding, modifiers }) {
      set({ phase: 'loading', error: null });
      try {
        const s = seed ?? randomSeed();
        const provider = new SimulatedProvider({ seed: s, syntheticEventsPerYear: shocksPerYear });
        await provider.init();
        const run = sampleRun({ seed: s, calendarLength: provider.getCalendar().length, companies: provider.getCompanies(), years, startingCash });
        run.funding = funding ?? { mode: 'lump', monthly: 0 };
        run.modifiers = modifiers ?? {};
        await beginPlay(run, 'sandbox', provider, null);
      } catch (e) {
        set({ phase: 'menu', error: `เริ่ม Sandbox ไม่สำเร็จ: ${String(e)}` });
      }
    },

    async startChapter(id) {
      const provider = get().provider;
      const def = chapterById(id);
      if (!provider || !def) return;
      set({ phase: 'loading', error: null });
      try {
        const { run, roles, decisionDay } = resolveChapter(provider, def);
        await beginPlay(run, 'tutorial', provider, { chapterId: id, roles, decisionDay, step: 0, decided: false }, (p, view) => {
          let out = p;
          for (const pre of def.preset ?? []) {
            const ids = roles[pre.role] ?? [];
            out = applyAction(out, { kind: 'buy_basket', companyIds: ids, amount: p.cash * pre.fraction }, (cid) => view.close(cid), run.windowStart);
          }
          return out;
        });
      } catch (e) {
        set({ phase: 'menu', error: `เริ่มบทเรียนไม่สำเร็จ: ${String(e)}` });
      }
    },

    tutorialNext() {
      const t = get().tutorial;
      if (t) set({ tutorial: { ...t, step: t.step + 1 } });
    },

    advanceDay() {
      const { view, run, phase, flow } = get();
      if (!view || !run || phase !== 'playing') return;
      if (flow === 'decision' || flow === 'outcome' || flow === 'payday') return;
      if (view.currentDay >= run.windowEnd) {
        endOfWindow();
        return;
      }
      const day = view.currentDay + 1;
      view.setDay(day);
      const priceOf = (id: string) => view.close(id);
      let { portfolio } = get();
      const { equity, scheduled } = get();

      // Scheduled instalments (e.g. a DCA option chosen in a decision).
      const due = scheduled.filter((s) => s.day <= day);
      if (due.length) {
        for (const s of due) portfolio = applyAction(portfolio, s.action, priceOf, day);
        set({ scheduled: scheduled.filter((s) => s.day > day) });
      }

      // DCA payday: add the contribution, then invest automatically or ask.
      let contrib = 0;
      let dca = get().dca;
      let openPayday: Payday | null = null;
      if (dca && isPayday(view.calendar, day)) {
        contrib = dca.monthly;
        portfolio = { ...portfolio, cash: portfolio.cash + contrib };
        const idxNow = view.indexBar()?.close ?? 1;
        const idxHi = Math.max(...Array.from(view.indexCloses(day - 252)));
        const inDrop = idxNow <= idxHi * 0.9;
        dca = { ...dca, benchUnits: dca.benchUnits + contrib / idxNow };
        const hasPlan = planTotal(dca.plan) > 0;
        // Only ask on the first payday, when the market is down ≥10% (at most every ~6 months),
        // or every month if the player turned auto-invest off. Otherwise invest silently.
        const ask =
          flow === 'normal' && (!dca.auto || dca.asked === 0 || (inDrop && day - dca.lastAskedDay >= 126));
        if (!ask) {
          const held = Object.keys(portfolio.holdings);
          const plan = hasPlan ? dca.plan : equalPlan(held.length ? held : view.companies.map((c) => c.id));
          portfolio = executePlan(portfolio, plan, view.companies, contrib, priceOf, day);
          if (flow === 'normal') set({ paydayNotice: { id: ++bannerId, amount: contrib } });
          if (inDrop) dca = { ...dca, dropInvested: [...dca.dropInvested, { day, amount: contrib }] };
        } else {
          openPayday = { day, amount: contrib, inDrop };
          dca = { ...dca, asked: dca.asked + 1, lastAskedDay: day };
        }
      }

      const value = totalValue(portfolio, priceOf);
      const idx = view.indexBar()?.close;
      const idx0 = view.indexBar(run.windowStart)?.close ?? 1;
      const index = dca ? dca.benchUnits * (idx ?? idx0) : idx ? (run.startingCash * idx) / idx0 : equity[equity.length - 1].index;
      const point: EquityPoint = { day, value, index, cash: portfolio.cash, div: holdingsDiversification(portfolio, view), contrib };
      const nextEquity = [...equity, point];
      set({ day, equity: nextEquity, portfolio, dca });
      updateWorld(view, run, day);

      const failed = challengeFailure(run.modifiers, nextEquity.map((e) => e.value));
      if (failed) {
        set({ challengeFailed: failed });
        get().finishRun();
        return;
      }

      if (flow === 'fastforward') {
        if (day >= (get().pending?.endDay ?? day)) finalizeOutcome();
        return;
      }
      if (openPayday) {
        set({ payday: openPayday, flow: 'payday', speed: 0 });
        return;
      }

      const { mode, tutorial, tracker } = get();
      if (mode === 'tutorial' && tutorial) {
        if (!tutorial.decided && day >= tutorial.decisionDay) {
          const def = chapterById(tutorial.chapterId)!;
          openDecision(buildChapterDecision(def, view, portfolio, tutorial.roles, run.disguisedNames));
        }
      } else {
        // DCA runs are long: space decisions further apart so play isn't constantly interrupted.
        // Hand-written event decisions share the same cap; they may come a little sooner after the last one.
        const dcaRun = run.funding?.mode === 'dca';
        const minGap = dcaRun ? 42 : 21;
        const maxPerRun = dcaRun ? Math.min(7, 2 + run.years) : maxDecisionsFor(run.years);
        const ed = dueEventDecision(day);
        const eventAllowed = tracker.count < maxPerRun && day - tracker.lastDay >= minGap / 2;
        if (ed && eventAllowed) {
          set({ firedEventDecisions: [...get().firedEventDecisions, ed.d.def.id] });
          openDecision(buildEventDecision(ed.d.def, ed.ev.tag, view, portfolio));
        } else if (!ed && !eventDecisionSoon(day)) {
          const candidates = detectTriggers(view, portfolio, nextEquity);
          const pick = pickTrigger(candidates, tracker, day, {
            minGap,
            maxPerRun,
            windowStart: run.windowStart,
            windowEnd: run.windowEnd,
          });
          if (pick) openDecision(buildDecision(pick, view, portfolio, run.disguisedNames));
        }
      }
      if (day >= run.windowEnd && get().flow === 'normal') endOfWindow();
    },

    chooseOption(optionId) {
      const { decision: dp, view, run, portfolio, equity, tutorial, scheduled } = get();
      if (!dp || !view || !run) return;
      const portfolios = optionPortfolios(dp, portfolio, view);
      const next = portfolios[optionId] ?? portfolio;
      const endDay = Math.min(run.windowEnd, dp.day + dp.forwardDays);
      const eq = equity.slice();
      const last = eq[eq.length - 1];
      eq[eq.length - 1] = { ...last, value: totalValue(next, (id) => view.close(id)), cash: next.cash };
      const option = dp.options.find((o) => o.id === optionId);
      set({
        portfolio: next,
        equity: eq,
        decision: null,
        pending: { dp, chosenId: optionId, portfolios, before: portfolio, endDay },
        flow: 'fastforward',
        scheduled: option ? [...scheduled, ...scheduledParts(option.action, dp.day)] : scheduled,
        tutorial: tutorial ? { ...tutorial, decided: true } : null,
      });
      if (endDay - dp.day < 3) finalizeOutcome();
    },

    skipDecision() {
      const { decision, view, tracker, lastSpeed } = get();
      if (!decision) return;
      // Counts as the month's decision so the game doesn't immediately ask again.
      set({ decision: null, flow: 'normal', speed: lastSpeed, tracker: { ...tracker, lastDay: view?.currentDay ?? tracker.lastDay } });
    },

    continueAfterOutcome() {
      const { view, run, tracker } = get();
      // The "1 per month" gap counts from the end of the fast-forward, so the player gets free play in between.
      set({ outcome: null, flow: 'normal', tracker: { ...tracker, lastDay: view?.currentDay ?? tracker.lastDay } });
      if (view && run && view.currentDay >= run.windowEnd) endOfWindow();
    },

    resolvePayday(choice, opts = {}) {
      const { payday, view, portfolio, equity } = get();
      let dca = get().dca;
      if (!payday || !view || !dca) return;
      const priceOf = (id: string) => view.close(id);
      let next = portfolio;
      if (choice === 'plan' && planTotal(dca.plan) > 0) next = executePlan(portfolio, dca.plan, view.companies, payday.amount, priceOf, payday.day);
      if (choice === 'equal') {
        const ids = Object.keys(portfolio.holdings);
        next = executePlan(portfolio, equalPlan(ids.length ? ids : view.companies.map((c) => c.id)), view.companies, payday.amount, priceOf, payday.day);
      }
      const invested = choice === 'plan' || choice === 'equal';
      dca = {
        ...dca,
        skipped: dca.skipped + (choice === 'skip' ? 1 : 0),
        skippedDays: choice === 'skip' ? [...dca.skippedDays, payday.day] : dca.skippedDays,
        dropInvested: invested && payday.inDrop ? [...dca.dropInvested, { day: payday.day, amount: payday.amount }] : dca.dropInvested,
        monthly: opts.monthly && opts.monthly > 0 ? opts.monthly : dca.monthly,
        auto: opts.auto ?? dca.auto,
      };
      const eq = equity.slice();
      const last = eq[eq.length - 1];
      eq[eq.length - 1] = { ...last, value: totalValue(next, priceOf), cash: next.cash, div: holdingsDiversification(next, view) };
      set({ portfolio: next, equity: eq, dca, payday: null, flow: 'normal' });
      if (choice === 'skip') get().showToast('ข้ามการลงทุนเดือนนี้ เงินเก็บไว้เป็นเงินสด', 'info');
    },

    setPlan(plan, auto) {
      const dca = get().dca;
      if (dca) set({ dca: { ...dca, plan, auto: auto ?? dca.auto } });
    },

    setSpeed(speed) {
      set(speed === 0 ? { speed } : { speed, lastSpeed: speed });
    },

    togglePause() {
      const { speed, lastSpeed } = get();
      set({ speed: speed === 0 ? lastSpeed || 1 : 0 });
    },

    select(id, fly = false) {
      set((s) => {
        // Closing a building always brings the camera back to the overview.
        if (!id) return { selectedId: null, landmark: null, homeTick: s.selectedId || s.landmark ? s.homeTick + 1 : s.homeTick };
        return fly ? { selectedId: id, landmark: null, focusTarget: id, focusTick: s.focusTick + 1 } : { selectedId: id, landmark: null };
      });
    },

    selectLandmark(id) {
      // Same camera behaviour as companies: fly in on open, back to the overview on close.
      set((s) =>
        id
          ? { landmark: id, selectedId: null, focusTarget: `@${id}`, focusTick: s.focusTick + 1 }
          : { landmark: null, homeTick: s.landmark ? s.homeTick + 1 : s.homeTick },
      );
    },

    cameraHome() {
      set((s) => ({ selectedId: null, homeTick: s.homeTick + 1 }));
    },

    lookAt(id) {
      set((s) => ({ focusTarget: id, focusTick: s.focusTick + 1 }));
    },

    hover(id) {
      if (get().hoveredId !== id) set({ hoveredId: id });
    },

    trade(side, companyId, shares) {
      const { view, portfolio, phase, flow } = get();
      if (!view || phase !== 'playing') return false;
      if (flow !== 'normal' && flow !== 'payday') {
        get().showToast('ซื้อขายได้หลังจากตัดสินใจและดูผลเสร็จแล้ว', 'info');
        return false;
      }
      const bar = view.bar(companyId);
      const order = { companyId, shares, price: bar?.close ?? NaN, day: view.currentDay };
      const r = side === 'buy' ? buy(portfolio, order) : sell(portfolio, order);
      if (!r.ok) {
        get().showToast(TRADE_ERRORS[r.error], 'bad');
        return false;
      }
      const ctx = ruleCtx(flow === 'payday');
      const violation = ctx && ruleViolation(portfolio, r.portfolio, ctx);
      if (violation) {
        get().showToast(violation, 'bad');
        return false;
      }
      const equity = get().equity.slice();
      const last = equity[equity.length - 1];
      if (last && last.day === view.currentDay) {
        equity[equity.length - 1] = { ...last, value: totalValue(r.portfolio, (id) => view.close(id)), cash: r.portfolio.cash, div: holdingsDiversification(r.portfolio, view) };
      }
      set({ portfolio: r.portfolio, equity });
      const name = get().run?.disguisedNames[companyId] ?? companyId;
      get().showToast(`${side === 'buy' ? 'ซื้อ' : 'ขาย'} ${name} ${shares.toLocaleString('th-TH')} หุ้น สำเร็จ`, 'good');
      return true;
    },

    finishRun() {
      const { run, view, equity, portfolio, runInfo, phase, mode, dca, challengeFailed, goldenDays, progress } = get();
      if (!run || !view || phase !== 'playing') return;
      if (mode === 'tutorial') {
        set({ phase: 'menu', run: null, view: null, tutorial: null, ...resetPlay });
        return;
      }
      const report = buildReport(equity, portfolio.transactions, view, run.startingCash);
      const challenge = modifiersKey(run.modifiers);
      const record: RunRecord = {
        id: run.id,
        playedAt: new Date().toISOString(),
        seed: run.seed,
        years: run.years,
        startingCash: run.startingCash,
        finalValue: report.finalValue,
        totalReturn: report.totalReturn,
        indexReturn: report.indexReturn,
        maxDrawdown: report.maxDrawdown,
        trades: portfolio.transactions.length,
        dataset: runInfo?.label ?? '',
        mode,
        funding: run.funding?.mode ?? 'lump',
        challenge,
        grade: report.grades.overall,
        score: Math.round(report.scores.overall),
        failed: !!challengeFailed,
      };
      const history = [record, ...get().history].slice(0, 50);
      saveJson('mc.history', history);

      // Personal bests per funding mode + challenge combination.
      const bests = { ...get().bests };
      const key = `${mode}|${record.funding}|${challenge}`;
      if (!challengeFailed && (!bests[key] || report.scores.overall > bests[key].score)) {
        bests[key] = { score: Math.round(report.scores.overall), grade: report.grades.overall, totalReturn: report.totalReturn, excess: report.excess, playedAt: record.playedAt };
        saveJson('mc.bests', bests);
      }

      const yieldValue = Object.values(portfolio.holdings).reduce(
        (acc, h) => {
          const v = h.shares * (view.close(h.companyId) ?? 0);
          return { v: acc.v + v, y: acc.y + v * (view.fundamentals(h.companyId)?.dividendYield ?? 0) };
        },
        { v: 0, y: 0 },
      );
      set({ phase: 'ended', speed: 0, history, bests, report, selectedId: null, flow: 'normal', decision: null, pending: null, outcome: null, payday: null, newAchievementIds: [] });
      if (report.excess > 0 && !challengeFailed) get().celebrate();
      awardAchievements(
        newAchievements(
          {
            kind: mode === 'sandbox' ? 'sandbox' : 'run',
            report,
            funding: run.funding?.mode ?? 'lump',
            challenge: challenge !== 'none',
            challengeFailed: !!challengeFailed,
            hadTaggedEvent: !!run.taggedEventId || get().runEvents.length > 0,
            goldenDays,
            skippedPaydays: dca?.skipped ?? 0,
            dividendYield: yieldValue.v > 0 ? yieldValue.y / yieldValue.v : 0,
            chaptersDone: progress.chapters.length,
            runsPlayed: history.length,
          },
          get().achievements,
        ),
      );
    },

    backToMenu() {
      // Fly the camera back to the overview so the menu isn't framed on wherever play ended.
      set((s) => ({ phase: 'menu', run: null, view: null, equity: [], tutorial: null, dca: null, runEvents: [], ...resetPlay, homeTick: s.homeTick + 1 }));
    },

    setGraphics(graphics) {
      saveJson('mc.graphics', graphics);
      set({ graphics });
    },

    toggleSound() {
      const sound = !get().sound;
      saveJson('mc.sound', sound);
      set({ sound });
    },

    toggleMusic() {
      const music = !get().music;
      saveJson('mc.music', music);
      set({ music });
    },

    celebrate() {
      set((s) => ({ celebrateTick: s.celebrateTick + 1 }));
    },

    toggleTheme() {
      const theme = get().theme === 'light' ? 'dark' : 'light';
      applyTheme(theme);
      saveJson('mc.theme', theme);
      set({ theme });
    },

    showToast(text, tone = 'info') {
      const id = ++toastId;
      set({ toast: { id, text, tone } });
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 2600);
    },

    dismissPaydayNotice() {
      set({ paydayNotice: null });
    },

    dismissBanner() {
      set({ banner: null });
    },
  };
});

/** Real or disguised name of the active tagged event, for the reveal. */
export function revealedEvents(): { id: string; name: string; lesson: string }[] {
  const s = useGame.getState();
  const ids = new Set(s.runEvents.map((e) => e.tag.id));
  if (s.run?.taggedEventId) ids.add(s.run.taggedEventId);
  return [...ids].map((id) => eventById(id)!).filter(Boolean).map((e) => ({ id: e.id, name: e.name, lesson: e.lesson }));
}


if (import.meta.env.DEV) (globalThis as unknown as { __game: typeof useGame }).__game = useGame;
