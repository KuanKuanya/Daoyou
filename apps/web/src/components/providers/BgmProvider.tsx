import { BgmPlayer, type BgmStatus } from '@app/lib/audio/BgmPlayer';
import { getBgmTrack, resolveBgmProfile } from '@app/lib/audio/bgm';
import { updateGameSettings, useGameSettings } from '@app/lib/game-setting';
import { resolveGameScene } from '@app/lib/router/routeTitle';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMatches } from 'react-router';
import { BgmContext } from './bgmContext';

export function BgmProvider({ children }: { children: ReactNode }) {
  const { musicEnabled, musicVolume } = useGameSettings();
  const scene = resolveGameScene(useMatches());
  const [combatViews, setCombatViews] = useState(0);
  const enterCombat = useCallback(() => {
    setCombatViews((count) => count + 1);
    return () => setCombatViews((count) => count - 1);
  }, []);
  const track = getBgmTrack(
    combatViews > 0 ? 'combat' : resolveBgmProfile(scene?.id),
  );
  const player = useRef<BgmPlayer | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const claimPlayback = useRef<(enabled?: boolean) => void>(() => undefined);
  const ownsPlayback = useRef(true);
  const [status, setStatus] = useState<BgmStatus>('off');

  useEffect(() => {
    const instance = new BgmPlayer(host.current!, setStatus);
    player.current = instance;
    return () => {
      player.current = null;
      instance.dispose();
    };
  }, []);

  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    const foreground = () =>
      document.visibilityState === 'visible' && document.hasFocus();
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel('daoyou-bgm');
    const sync = () =>
      instance.configure(
        musicEnabled,
        foreground() && ownsPlayback.current,
        track,
      );
    const claim = (enabled = musicEnabled) => {
      ownsPlayback.current = true;
      if (enabled && foreground()) channel?.postMessage('claim');
      instance.configure(enabled, foreground(), track);
    };
    const onFocus = () => claim();
    const activate = () => {
      claim();
      instance.activate();
    };
    claimPlayback.current = claim;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === 'claim') {
          ownsPlayback.current = false;
          sync();
        }
      };
    instance.setVolume(musicVolume);
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', sync);
    if (musicEnabled) {
      document.addEventListener('pointerdown', activate, { once: true });
      document.addEventListener('keydown', activate, { once: true });
    }
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', sync);
      document.removeEventListener('pointerdown', activate);
      document.removeEventListener('keydown', activate);
      channel?.close();
      claimPlayback.current = () => undefined;
    };
  }, [musicEnabled, musicVolume, track]);

  const setEnabled = (enabled: boolean) => {
    updateGameSettings({ musicEnabled: enabled });
    claimPlayback.current(enabled);
    if (enabled) player.current?.activate();
  };

  return (
    <BgmContext.Provider
      value={{
        status,
        trackName: track?.name ?? '',
        setEnabled,
        enterCombat,
        retry: () => {
          claimPlayback.current();
          player.current?.activate();
        },
      }}
    >
      {children}
      <div ref={host} hidden aria-hidden="true" data-bgm-status={status} />
    </BgmContext.Provider>
  );
}
