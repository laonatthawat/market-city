import { useEffect } from 'react';
import CityCanvas from './scene/CityCanvas';
import { useGame } from './store/gameStore';
import { ChapterComplete } from './ui/ChapterComplete';
import { Confetti } from './ui/Confetti';
import { DecisionModal } from './ui/DecisionModal';
import { NewsBanner } from './ui/NewsBanner';
import { PaydayModal } from './ui/PaydayModal';
import { PaydayNotice } from './ui/PaydayNotice';
import { Hud } from './ui/Hud';
import { InspectPanel } from './ui/InspectPanel';
import { LandmarkPanel } from './ui/LandmarkPanel';
import { Onboarding } from './ui/Onboarding';
import { OutcomeModal } from './ui/OutcomeModal';
import { LeftPanel } from './ui/PortfolioPanel';
import { RevealScreen } from './ui/RevealScreen';
import { StartScreen } from './ui/StartScreen';
import { TutorialCoach } from './ui/TutorialCoach';

export default function App() {
  const phase = useGame((s) => s.phase);
  const boot = useGame((s) => s.boot);
  const mode = useGame((s) => s.mode);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGame.getState();
      if (s.phase !== 'playing' || s.flow !== 'normal') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        s.togglePause();
      } else if (e.key === '1') s.setSpeed(1);
      else if (e.key === '2') s.setSpeed(5);
      else if (e.key === '3') s.setSpeed(20);
      else if (e.key === 'Escape') s.select(null);
      else if (e.key === 'Home') s.cameraHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <CityCanvas />
      </div>
      <div className="pointer-events-none absolute inset-0 z-20">
        {phase === 'boot' && <Center text="กำลังเตรียมเมือง…" />}
        {phase === 'menu' && <StartScreen />}
        {phase === 'menu' && <Onboarding />}
        {phase === 'loading' && <Center text="กำลังโหลดข้อมูลตลาด…" />}
        {phase === 'playing' && <PlayingLayout />}
        {phase === 'ended' && (mode === 'tutorial' ? <ChapterComplete /> : <RevealScreen />)}
        <Toast />
        <Confetti />
      </div>
    </div>
  );
}

function PlayingLayout() {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <Hud />
      <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
        <div className="flex h-full min-h-0 flex-col gap-3">
          <LeftPanel />
        </div>
        {/* Phones: company/landmark info opens as a bottom sheet over the lower part of the city. */}
        <div className="flex h-full min-h-0 items-start max-sm:absolute max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-[38%] max-sm:z-30 max-sm:h-auto max-sm:items-end">
          <InspectPanel />
          <LandmarkPanel />
        </div>
      </div>
      <CameraHomeButton />
      <NewsBanner />
      <TutorialCoach />
      <DecisionModal />
      <OutcomeModal />
      <PaydayGate />
      <PaydayNotice />
    </div>
  );
}

/** Appears once the camera has been moved; flies back to the starting overview. */
function CameraHomeButton() {
  const away = useGame((s) => s.cameraAway);
  const cameraHome = useGame((s) => s.cameraHome);
  if (!away) return null;
  return (
    <div className="pointer-events-auto absolute bottom-6 left-4">
      <button className="card pop-in flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold hover:bg-soft" onClick={cameraHome} title="กลับมุมกล้องเริ่มต้น (ปุ่ม Home)">
        🎯 กลับมุมเริ่มต้น
      </button>
    </div>
  );
}

function PaydayGate() {
  const day = useGame((s) => s.payday?.day);
  return day == null ? null : <PaydayModal key={day} />;
}

function Center({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="card px-6 py-4 font-display text-lg">{text}</div>
    </div>
  );
}

function Toast() {
  const toast = useGame((s) => s.toast);
  if (!toast) return null;
  const color = toast.tone === 'good' ? 'bg-up' : toast.tone === 'bad' ? 'bg-down' : 'bg-ink';
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
      <div key={toast.id} className={`pop-in rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-soft ${color}`}>
        {toast.text}
      </div>
    </div>
  );
}
