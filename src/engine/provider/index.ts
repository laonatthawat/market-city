import { HistoricalProvider } from './HistoricalProvider';
import type { MarketDataProvider } from './MarketDataProvider';
import { SimulatedProvider } from './SimulatedProvider';

export type { MarketDataProvider } from './MarketDataProvider';
export { HistoricalProvider } from './HistoricalProvider';
export { SimulatedProvider } from './SimulatedProvider';

/** Seed of the bundled fallback dataset, so the game runs before data is downloaded. */
export const FALLBACK_SEED = 20150102;

/** Historical data when available, otherwise the simulated fallback market. */
export async function createDefaultProvider(): Promise<MarketDataProvider> {
  try {
    const p = new HistoricalProvider();
    await p.init();
    return p;
  } catch (err) {
    console.info('[MarketCity] Historical data not found, using simulated fallback.', err);
    const p = new SimulatedProvider({ seed: FALLBACK_SEED });
    await p.init();
    return p;
  }
}
