import type { BgmStatus } from '@app/lib/audio/BgmPlayer';
import { createContext, useContext } from 'react';

export const BgmContext = createContext<{
  status: BgmStatus;
  trackName: string;
  setEnabled: (enabled: boolean) => void;
  retry: () => void;
  enterCombat: () => () => void;
} | null>(null);

export function useBgm() {
  const value = useContext(BgmContext);
  if (!value) throw new Error('BgmProvider is missing');
  return value;
}
