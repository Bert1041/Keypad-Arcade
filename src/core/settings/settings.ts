import { useSyncExternalStore } from 'react';
import { db as defaultDb, type AppDb } from '@/core/storage/db';

export interface Settings {
  soundEnabled: boolean;
}

const DEFAULTS: Settings = { soundEnabled: true };

let current: Settings = { ...DEFAULTS };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Load once at startup so every reader can stay synchronous. */
export async function loadSettings(db: AppDb = defaultDb): Promise<Settings> {
  try {
    const sound = await db.settings.get('soundEnabled');
    current = {
      soundEnabled: typeof sound?.value === 'boolean' ? sound.value : DEFAULTS.soundEnabled,
    };
  } catch {
    // Storage blocked (private mode, in-app browsers): run on defaults rather than fail.
    current = { ...DEFAULTS };
  }
  emit();
  return current;
}

export function getSettings(): Settings {
  return current;
}

export async function setSoundEnabled(enabled: boolean, db: AppDb = defaultDb): Promise<void> {
  current = { ...current, soundEnabled: enabled };
  emit();
  try {
    await db.settings.put({ key: 'soundEnabled', value: enabled });
  } catch {
    // Keep the in-memory value for this session even if it cannot be persisted.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}
