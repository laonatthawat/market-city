import { useEffect } from 'react';
import { useGame } from '../store/gameStore';

/** Breaking-news banner for tagged events (disguised) and Sandbox shocks. */
export function NewsBanner() {
  const banner = useGame((s) => s.banner);
  const dismiss = useGame((s) => s.dismissBanner);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => {
      if (useGame.getState().banner?.id === banner.id) dismiss();
    }, 9000);
    return () => clearTimeout(t);
  }, [banner, dismiss]);
  if (!banner) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[86px] w-[min(640px,calc(100%-32px))] -translate-x-1/2">
      <div key={banner.id} className="pop-in flex items-center gap-3 overflow-hidden rounded-2xl bg-[#2b2338] px-4 py-2.5 text-sm text-white shadow-soft">
        <span className="chip shrink-0 animate-pulse bg-[#ef3b3b] font-semibold text-white">ข่าวด่วน</span>
        <span className="flex-1">{banner.text.replace(/^ข่าวด่วน:\s*/, '')}</span>
        <button className="shrink-0 text-white/70 hover:text-white" onClick={dismiss} aria-label="ปิดข่าว">
          ✕
        </button>
      </div>
    </div>
  );
}
