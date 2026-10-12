import { apiFetch } from '@app/lib/api/fetch';
import {
  CombatActivityNoticeSchema,
  type CombatActivityNotice,
} from '@daoyou/contracts/combat/activity';
import { useEffect, useState } from 'react';

const POLL_MS = 8_000;

export function useCombatActivityNotice(cultivatorId: string | null) {
  const [result, setResult] = useState<{
    cultivatorId: string;
    notice: CombatActivityNotice | null;
  } | null>(null);
  useEffect(() => {
    if (!cultivatorId) return;
    let cancelled = false;
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (cancelled || document.visibilityState !== 'visible' || request)
        return;
      clearTimeout(timer);
      const abort = new AbortController();
      request = abort;
      try {
        const response = await apiFetch('/api/combat-v6/activity', {
          cache: 'no-store',
          signal: abort.signal,
        });
        const body = (await response.json()) as {
          success?: boolean;
          data?: unknown;
        };
        if (!response.ok || !body.success) return;
        const parsed = CombatActivityNoticeSchema.nullable().safeParse(
          body.data ?? null,
        );
        if (
          !cancelled &&
          !abort.signal.aborted &&
          request === abort &&
          parsed.success
        )
          setResult({ cultivatorId, notice: parsed.data });
      } catch {
        // Keep the last notice until the next successful poll.
      } finally {
        if (request === abort) {
          request = undefined;
          if (!cancelled && document.visibilityState === 'visible')
            timer = setTimeout(() => void load(), POLL_MS);
        }
      }
    };
    const onVisible = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        void load();
      } else {
        const pending = request;
        request = undefined;
        pending?.abort();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    void load();
    return () => {
      cancelled = true;
      request?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cultivatorId]);
  return cultivatorId && result?.cultivatorId === cultivatorId
    ? result.notice
    : null;
}
