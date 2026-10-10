import { CameraControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Color, Vector3 } from 'three';
import type { DirectionalLight, HemisphereLight } from 'three';
import { chapterById } from '../data/tutorials';
import { changeOver } from '../engine/indicators';
import { playClock } from '../store/clock';
import { FAST_FORWARD_SPEED, msPerDay, useGame } from '../store/gameStore';
import Building from './Building';
import { IndexTower } from './IndexTower';
import { Clickable, Landmarks, landmarkSpot } from './Landmarks';
import { getLayout } from './useLayout';
import { bodyColor, heightFromCap, needsScaffold, widthFromRevenue, windowColor } from './visuals';
import { AutoQuality, Effects } from './Effects';
import { Birds, CityWalkers, Smoke } from './Life';
import { Cars, TrafficLights } from './Traffic';
import { WeatherFx, weatherFx } from './Weather';
import { Bushes, Island, Ocean, Plaza, Roads, SkyDome } from './Environment';
import { Clouds, Districts, Fillers, LotPlanters, Parks, Trees } from './World';
import { Balloons, Beach, Butterflies, Meadow, Sailboats } from './Nature';
import { Walkways } from './Paths';

const HOME = { pos: [0, 75, 99] as const, target: [0, 1, 5] as const };
const HOME_POS = new Vector3(...HOME.pos);
const HOME_TARGET = new Vector3(...HOME.target);

export default function CityCanvas() {
  const select = useGame((s) => s.select);
  const dark = useGame((s) => s.theme === 'dark');
  const high = useGame((s) => s.graphics === 'high');
  return (
    <Canvas
      shadows={high}
      flat
      dpr={high ? [1, 1.5] : 1}
      camera={{ position: [...HOME.pos], fov: 38, near: 0.5, far: 700 }}
      onPointerMissed={() => select(null)}
      onCreated={(state) => {
        // Dev-only handle for inspecting draw calls and frame cost from the console.
        if (import.meta.env.DEV) (globalThis as unknown as { __r3f: typeof state }).__r3f = state;
      }}
    >
      <color attach="background" args={[dark ? '#262a48' : '#fbe7d6']} />
      <fog attach="fog" args={[dark ? '#262a48' : '#fbe7d6', 150, 340]} />
      <Suspense fallback={null}>
        <SceneContents dark={dark} />
        {high && <Effects dark={dark} />}
      </Suspense>
      <AutoQuality />
    </Canvas>
  );
}

function SceneContents({ dark }: { dark: boolean }) {
  const high = useGame((s) => s.graphics === 'high');
  const run = useGame((s) => s.run);
  const stormy = useGame((s) => (s.phase === 'playing' || s.phase === 'ended') && (s.weather === 'rain' || s.weather === 'storm'));
  const view = useGame((s) => s.view);
  const layout = useMemo(() => (run && view ? getLayout(run, view.companies) : null), [run, view]);
  return (
    <>
      <PlaybackDriver />
      <Lights dark={dark} />
      <WeatherFx />
      <CameraRig />
      <SkyDome dark={dark} />
      <Ocean dark={dark} />
      <Island dark={dark} />
      <Beach dark={dark} />
      <Sailboats dark={dark} />
      <Balloons dark={dark} />
      <Plaza dark={dark} />
      <Clouds dark={dark} stormy={stormy} />
      <Birds />
      {layout && (
        <>
          <Roads districts={layout.districts} dark={dark} />
          <Districts layout={layout} dark={dark} />
          <Walkways districts={layout.districts} dark={dark} />
          <Bushes bushes={layout.bushes} dark={dark} />
          {/* Small ground detail is skipped in performance mode. */}
          {high && <Meadow layout={layout} dark={dark} />}
          {high && <Butterflies layout={layout} dark={dark} />}
          <Fillers layout={layout} dark={dark} />
          <Parks layout={layout} dark={dark} />
          <Trees trees={layout.trees} dark={dark} />
          <CityBuildings />
          <IndexMonument />
          <Landmarks dark={dark} />
          <Cars dark={dark} />
          <TrafficLights />
          <CityWalkers districts={layout.districts} />
          <Smoke lots={layout.lots} />
        </>
      )}
    </>
  );
}

/** Advances trading days according to the selected speed. */
function PlaybackDriver() {
  useFrame((_, dt) => {
    const s = useGame.getState();
    if (s.phase !== 'playing') return;
    const speed = s.flow === 'fastforward' ? FAST_FORWARD_SPEED : s.flow === 'normal' ? s.speed : 0;
    if (speed === 0) return;
    const ms = msPerDay(s.run);
    playClock.acc += Math.min(dt, 0.1) * 1000 * speed;
    let steps = 0;
    while (playClock.acc >= ms && steps < 3) {
      playClock.acc -= ms;
      useGame.getState().advanceDay();
      steps++;
    }
    if (playClock.acc >= ms) playClock.acc = 0;
    playClock.progress = playClock.acc / ms;
  });
  return null;
}

function Lights({ dark }: { dark: boolean }) {
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const gold = useMemo(() => new Color('#ffc56e'), []);
  const phase = useRef(0.62);
  const warm = useMemo(() => new Color(), []);
  const cool = useMemo(() => new Color(), []);
  useFrame((_, dt) => {
    const s = useGame.getState();
    // One sun arc per trading day at 1x; at higher speeds hold golden hour to avoid flicker.
    const goal = s.speed === 1 ? 0.15 + playClock.progress * 0.7 : 0.62;
    phase.current += (goal - phase.current) * Math.min(1, dt * (s.speed === 1 ? 6 : 1.5));
    const ph = phase.current;
    const az = -1.3 + ph * 2.6;
    const el = 0.45 + 0.35 * Math.sin(Math.PI * ph);
    const l = sun.current;
    if (!l) return;
    l.position.set(Math.cos(az) * 70 * Math.cos(el), Math.sin(el) * 80, Math.sin(az) * 40 + 50);
    cool.set(dark ? '#c7d0ff' : '#fff2df');
    warm.set(dark ? '#9fb0ff' : '#ffd7a8').lerp(cool, Math.sin(Math.PI * ph) * 0.6);
    l.color.copy(warm).lerp(gold, weatherFx.warm * 0.6);
    l.intensity = (dark ? 1.1 : 2.1) * weatherFx.sun;
    if (hemi.current) hemi.current.intensity = (dark ? 0.9 : 1.25) * weatherFx.hemi + weatherFx.flash * 2.5;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={[dark ? '#5a6190' : '#fff4e8', dark ? '#2a2438' : '#c9b8d8', dark ? 0.9 : 1.25]} />
      <directionalLight
        ref={sun}
        intensity={dark ? 1.1 : 2.1}
        castShadow
        shadow-mapSize={[1536, 1536]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-62}
        shadow-camera-right={62}
        shadow-camera-top={62}
        shadow-camera-bottom={-62}
        shadow-camera-near={1}
        shadow-camera-far={260}
      />
    </>
  );
}

function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const focusTick = useGame((s) => s.focusTick);
  const homeTick = useGame((s) => s.homeTick);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.minDistance = 12;
    c.maxDistance = 190;
    c.maxPolarAngle = 1.38;
    c.dollyToCursor = true;
    c.smoothTime = 0.35;
    // Track whether the view has drifted from the start, so the "back" button only shows when useful.
    const pos = new Vector3();
    const tgt = new Vector3();
    const check = () => {
      c.getPosition(pos);
      c.getTarget(tgt);
      const away = pos.distanceTo(HOME_POS) > 4 || tgt.distanceTo(HOME_TARGET) > 3;
      if (useGame.getState().cameraAway !== away) useGame.setState({ cameraAway: away });
    };
    c.addEventListener('rest', check);
    c.addEventListener('controlend', check);
    c.addEventListener('transitionstart', check);
    return () => {
      c.removeEventListener('rest', check);
      c.removeEventListener('controlend', check);
      c.removeEventListener('transitionstart', check);
    };
  }, []);

  useEffect(() => {
    if (!focusTick) return;
    const { focusTarget: selectedId, run, view, progress, achievements, history } = useGame.getState();
    const c = ref.current;
    if (!c || !selectedId || !run || !view) return;
    if (selectedId.startsWith('@')) {
      // Landmarks (bank, civic buildings): a closer, lower view than for towers.
      const spot = landmarkSpot(selectedId.slice(1), { chapters: progress.chapters, achievements, runsPlayed: history.length });
      if (!spot) return;
      const dist = spot.dist;
      // The index tower stands among the districts: look straight down the open south spoke instead.
      if (selectedId === '@index') {
        void c.setLookAt(0, spot.h * 0.4 + dist * 0.62, dist * 0.8, 0, spot.h * 0.45, 0, true);
        return;
      }
      void c.setLookAt(spot.x + dist * 0.4, spot.h * 0.4 + dist * 0.55, spot.z + dist * 0.85, spot.x, spot.h * 0.4, spot.z, true);
      return;
    }
    const lot = getLayout(run, view.companies).byCompany.get(selectedId);
    const snap = view.snapshot(selectedId);
    if (!lot || !snap) return;
    const h = heightFromCap(snap.marketCap);
    const dist = 30 + h * 0.9;
    void c.setLookAt(lot.x + dist * 0.55, h * 0.55 + dist * 0.55, lot.z + dist * 0.85, lot.x, h * 0.45, lot.z, true);
  }, [focusTick]);

  useEffect(() => {
    if (!homeTick) return;
    void ref.current?.setLookAt(...HOME.pos, ...HOME.target, true);
  }, [homeTick]);

  return <CameraControls ref={ref} makeDefault />;
}

function CityBuildings() {
  const view = useGame((s) => s.view);
  const run = useGame((s) => s.run);
  const day = useGame((s) => s.day);
  const holdings = useGame((s) => s.portfolio.holdings);
  const selectedId = useGame((s) => s.selectedId);
  const hoveredId = useGame((s) => s.hoveredId);
  const select = useGame((s) => s.select);
  const hover = useGame((s) => s.hover);
  const onSelect = useMemo(() => (id: string) => select(id, true), [select]);
  const highlighted = useGame((s) => {
    const t = s.tutorial;
    if (!t || s.mode !== 'tutorial') return '';
    const step = chapterById(t.chapterId)?.steps[t.step];
    return (step?.highlight ?? []).flatMap((r) => t.roles[r] ?? []).join(',');
  });

  const items = useMemo(() => {
    if (!view || !run) return [];
    const layout = getLayout(run, view.companies);
    const c = new Color();
    return view.companies.flatMap((co) => {
      const snap = view.snapshot(co.id);
      const lot = layout.byCompany.get(co.id);
      if (!snap || !lot) return [];
      return [
        {
          id: co.id,
          x: lot.x,
          z: lot.z,
          rot: lot.rot,
          height: heightFromCap(snap.marketCap),
          width: widthFromRevenue(snap.revenue),
          body: '#' + bodyColor(co.sector, snap.pe, c).getHexString(),
          windows: '#' + windowColor(snap.momentum20, c).getHexString(),
          scaffold: needsScaffold(snap, co.sector),
          change: snap.change1d,
          label: run.disguisedNames[co.id],
          sector: co.sector,
        },
      ];
    });
    // `day` drives recomputation: the view itself is a stable object.
  }, [view, run, day]);
  // Planters only move when a tower's footprint crosses the size threshold.
  const spotsKey = items.map((it) => (it.width <= 3.1 ? 1 : 0)).join('');
  const spots = useMemo(() => items.map((it) => ({ x: it.x, z: it.z, rot: it.rot, width: it.width })), [spotsKey, run]);
  const dark = useGame((s) => s.theme === 'dark');

  return (
    <group>
      <LotPlanters spots={spots} dark={dark} />
      {items.map((it) => (
        <Building
          key={it.id}
          {...it}
          owned={!!holdings[it.id]}
          selected={selectedId === it.id}
          hovered={hoveredId === it.id}
          highlighted={highlighted.split(',').includes(it.id)}
          onSelect={onSelect}
          onHover={hover}
        />
      ))}
    </group>
  );
}

function IndexMonument() {
  const view = useGame((s) => s.view);
  const run = useGame((s) => s.run);
  const selected = useGame((s) => s.landmark === 'index');
  const selectLandmark = useGame((s) => s.selectLandmark);
  useGame((s) => s.day);
  if (!view || !run) return null;
  const now = view.indexBar()?.close ?? 1;
  const start = view.indexBar(run.windowStart)?.close ?? now;
  const closes = view.indexCloses(view.currentDay - 25);
  return (
    <Clickable id="index" x={0} z={0} radius={5.3} selected={selected} onSelect={selectLandmark}>
      <IndexTower ratio={now / start} momentum={changeOver(closes, 20) ?? 0} onSelect={() => selectLandmark('index')} />
    </Clickable>
  );
}
