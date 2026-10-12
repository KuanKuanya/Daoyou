/** Keep the same operation key until its committed result is received. */
export function pendingCommandRequest(
  owner: string,
  action: string,
  payload: unknown = null,
) {
  const key = `pending-command:${owner}:${action}:${JSON.stringify(payload)}`;
  const requestId = window.sessionStorage.getItem(key) ?? crypto.randomUUID();
  window.sessionStorage.setItem(key, requestId);
  return {
    requestId,
    complete() {
      if (window.sessionStorage.getItem(key) === requestId)
        window.sessionStorage.removeItem(key);
    },
  };
}

export function hasPendingCommandRequest(owner: string, action: string) {
  return (
    window.sessionStorage.getItem(`pending-command:${owner}:${action}:null`) !==
    null
  );
}

const payloadFallback = new Map<string, string>();

function readPendingPayload(key: string) {
  try {
    return (
      window.sessionStorage.getItem(key) ?? payloadFallback.get(key) ?? null
    );
  } catch {
    return payloadFallback.get(key) ?? null;
  }
}

/** Freeze parameters as well as the operation key while its result is unknown. */
export function pendingCommandRequestWithPayload<T>(
  owner: string,
  action: string,
  payload: T,
  parsePayload: (value: unknown) => T | undefined,
  legacyPayload?: T,
) {
  const key = `pending-command-payload:${owner}:${action}:v1`;
  const legacyKey = `pending-command:${owner}:${action}:null`;
  let stored: { requestId: string; payload: T } | undefined;
  try {
    const value = JSON.parse(readPendingPayload(key) ?? 'null');
    const parsed = parsePayload(value?.payload);
    if (typeof value?.requestId === 'string' && parsed !== undefined)
      stored = { requestId: value.requestId, payload: parsed };
  } catch {
    // Malformed local records cannot provide a trustworthy operation payload.
  }
  const legacyId =
    legacyPayload === undefined ? null : readPendingPayload(legacyKey);
  const pending = stored ?? {
    requestId: legacyId ?? crypto.randomUUID(),
    payload: legacyId && legacyPayload !== undefined ? legacyPayload : payload,
  };
  const serialized = JSON.stringify(pending);
  payloadFallback.set(key, serialized);
  try {
    window.sessionStorage.setItem(key, serialized);
    if (legacyId) window.sessionStorage.removeItem(legacyKey);
  } catch {
    // Repeated clicks remain idempotent while storage is unavailable.
  }
  return {
    ...pending,
    complete() {
      if (readPendingPayload(key) !== serialized) return;
      payloadFallback.delete(key);
      try {
        window.sessionStorage.removeItem(key);
        if (legacyId) window.sessionStorage.removeItem(legacyKey);
      } catch {
        // The in-memory pending record has already been removed.
      }
    },
  };
}
