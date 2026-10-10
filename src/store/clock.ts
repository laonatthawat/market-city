/** Mutable playback clock shared by the frame loop (kept out of React state on purpose). */
export const playClock = {
  /** Accumulated ms toward the next trading day. */
  acc: 0,
  /** Fraction of the current trading day elapsed (0..1). */
  progress: 0,
};
