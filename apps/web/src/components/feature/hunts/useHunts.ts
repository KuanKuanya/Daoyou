import { fetchJsonCached } from '@app/lib/client/requestCache';
import { useCultivatorIdentity } from '@app/lib/resources/player';
import { useCallback, useEffect, useState } from 'react';
export async function huntRequest<T>(
  url: string,
  actorId: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetchJsonCached<{ data: T }>(url, {
    key: `hunts:${actorId}:${url}`,
    signal,
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  return response.data;
}
export function useHunts<T>(url: string, interval = 5000) {
  const actorId = useCultivatorIdentity().data?.cultivator?.id ?? '';
  const [result, setResult] = useState<{
    data?: T;
    error?: string;
    actorId: string;
    url: string;
  }>({ actorId, url });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!actorId) return;
    let disposed = false;
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (disposed || document.visibilityState !== 'visible' || request) return;
      clearTimeout(timer);
      const abort = new AbortController();
      request = abort;
      try {
        const data = await huntRequest<T>(
          url,
          actorId,
          undefined,
          abort.signal,
        );
        if (!disposed && !abort.signal.aborted && request === abort)
          setResult({ data, actorId, url });
      } catch (cause) {
        if (!disposed && !abort.signal.aborted && request === abort)
          setResult((previous) => ({
            ...(previous.actorId === actorId && previous.url === url
              ? previous
              : {}),
            actorId,
            url,
            error: cause instanceof Error ? cause.message : '载入失败',
          }));
      } finally {
        if (request === abort) {
          request = undefined;
          if (!disposed && document.visibilityState === 'visible')
            timer = setTimeout(() => void run(), interval);
        }
      }
    };
    const onVisible = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        void run();
      } else {
        const pending = request;
        request = undefined;
        pending?.abort();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    void run();
    return () => {
      disposed = true;
      request?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [url, interval, actorId, revision]);
  return {
    data:
      result.actorId === actorId && result.url === url
        ? result.data
        : undefined,
    error:
      result.actorId === actorId && result.url === url
        ? result.error
        : undefined,
    actorId,
    refresh: useCallback(() => setRevision((n) => n + 1), []),
  };
}
