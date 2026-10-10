import { setMusic, setMusicMood } from '../lib/music';
import { setRain, setSoundEnabled, sfx, unlockAudio } from '../lib/sound';
import { useGame } from './gameStore';

/** Maps game-state changes to sound effects. Call once at startup. */
export function installSoundBridge() {
  setSoundEnabled(useGame.getState().sound);
  window.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });
  // Browsers only allow audio after a gesture, so the music starts on the first click or key.
  const startMusic = () => {
    window.removeEventListener('pointerdown', startMusic);
    window.removeEventListener('keydown', startMusic);
    if (useGame.getState().music) setMusic(true);
  };
  window.addEventListener('pointerdown', startMusic, { passive: true });
  window.addEventListener('keydown', startMusic);

  useGame.subscribe((s, prev) => {
    if (s.music !== prev.music) setMusic(s.music);
    if (s.weather !== prev.weather || s.phase !== prev.phase) {
      const gloomy = s.phase === 'playing' && (s.weather === 'rain' || s.weather === 'storm' || s.weather === 'fog');
      setMusicMood(gloomy ? 'dim' : 'bright');
    }
    if (s.sound !== prev.sound) setSoundEnabled(s.sound);
    if (!s.sound) return;
    if (s.decision && !prev.decision) sfx.alert();
    if (s.outcome && !prev.outcome) sfx.whoosh();
    if (s.payday && !prev.payday) sfx.coin();
    if (s.paydayNotice && s.paydayNotice.id !== prev.paydayNotice?.id) sfx.coin();
    if (s.banner && s.banner.id !== prev.banner?.id) sfx.news();
    if (s.celebrateTick !== prev.celebrateTick) sfx.fanfare();

    // Manual trades (decision/plan purchases are covered by their own sounds).
    const n = s.portfolio.transactions.length;
    if (s.flow === 'normal' && prev.flow === 'normal' && n === prev.portfolio.transactions.length + 1 && s.run === prev.run) {
      if (s.portfolio.transactions[n - 1].side === 'buy') sfx.buy();
      else sfx.sell();
    }

    if (s.weather !== prev.weather || s.phase !== prev.phase) {
      const playing = s.phase === 'playing';
      setRain(playing && s.weather === 'storm' ? 0.9 : playing && s.weather === 'rain' ? 0.5 : 0);
    }
  });
}
