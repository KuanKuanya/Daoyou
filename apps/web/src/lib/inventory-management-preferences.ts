import type { MailDestination } from '@daoyou/contracts/mail';
import { useCallback, useSyncExternalStore } from 'react';

export interface InventoryManagementPreferences {
  mailDestination: MailDestination;
  materialsToStorage: boolean;
  lowRealmEquipmentToStorage: boolean;
}

const defaults: Readonly<InventoryManagementPreferences> = {
  mailDestination: 'bag',
  materialsToStorage: true,
  lowRealmEquipmentToStorage: true,
};
type Entry = {
  snapshot: Readonly<InventoryManagementPreferences>;
  memoryOnly: boolean;
  listeners: Set<() => void>;
};
const entries = new Map<string, Entry>();
const storageKey = (owner: string) => `inventory-management:${owner}:v1`;

function normalize(value: unknown): Readonly<InventoryManagementPreferences> {
  if (!value || typeof value !== 'object') return defaults;
  const stored = value as Record<string, unknown>;
  return {
    mailDestination: stored.mailDestination === 'storage' ? 'storage' : 'bag',
    materialsToStorage:
      typeof stored.materialsToStorage === 'boolean'
        ? stored.materialsToStorage
        : defaults.materialsToStorage,
    lowRealmEquipmentToStorage:
      typeof stored.lowRealmEquipmentToStorage === 'boolean'
        ? stored.lowRealmEquipmentToStorage
        : defaults.lowRealmEquipmentToStorage,
  };
}

function read(owner: string) {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(storageKey(owner)) ?? 'null',
    );
    return stored?.version === 1 ? normalize(stored) : defaults;
  } catch {
    return defaults;
  }
}

function entryFor(owner: string): Entry {
  let entry = entries.get(owner);
  if (!entry) {
    entry = { snapshot: read(owner), memoryOnly: false, listeners: new Set() };
    entries.set(owner, entry);
  }
  return entry;
}

function publish(entry: Entry, next: Readonly<InventoryManagementPreferences>) {
  const current = entry.snapshot;
  if (
    current.mailDestination === next.mailDestination &&
    current.materialsToStorage === next.materialsToStorage &&
    current.lowRealmEquipmentToStorage === next.lowRealmEquipmentToStorage
  )
    return;
  entry.snapshot = next;
  entry.listeners.forEach((listener) => listener());
}

export function updateInventoryManagementPreferences(
  owner: string,
  patch: Partial<InventoryManagementPreferences>,
) {
  const entry = entryFor(owner);
  const next = normalize({ ...entry.snapshot, ...patch });
  try {
    window.localStorage.setItem(
      storageKey(owner),
      JSON.stringify({ version: 1, ...next }),
    );
    entry.memoryOnly = false;
  } catch {
    entry.memoryOnly = true;
  }
  publish(entry, next);
}

export function useInventoryManagementPreferences(owner?: string) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!owner) return () => undefined;
      const entry = entryFor(owner);
      const onStorage = (event: StorageEvent) => {
        if (
          event.storageArea === window.localStorage &&
          (event.key === storageKey(owner) || event.key === null)
        )
          publish(entry, read(owner));
      };
      entry.listeners.add(listener);
      window.addEventListener('storage', onStorage);
      if (!entry.memoryOnly) publish(entry, read(owner));
      return () => {
        entry.listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    [owner],
  );
  const getSnapshot = useCallback(
    () => (owner ? entryFor(owner).snapshot : defaults),
    [owner],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => defaults);
}
