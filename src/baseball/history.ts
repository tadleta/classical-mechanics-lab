import type { ParkResult } from './ballparks';
import type { Score } from './scoring';

export const HISTORY_LIMIT = 10;
export const HISTORY_KEY = 'cml-launch-history-v1';

export type LaunchMode = 'baseball' | 'projectile';

export type SavedLaunch = {
  id: string;
  at: number;
  mode: LaunchMode;
  speedMs: number;
  angle: number;
  sprayAngle: number;
  ballRadius: number;
  distanceM: number;
  maxHeightM: number;
  hangTimeS: number;
  play: Score | null;
  parks: ParkResult[] | null;
};

export function rememberLaunch(existing: SavedLaunch[], next: SavedLaunch): SavedLaunch[] {
  return [next, ...existing].slice(0, HISTORY_LIMIT);
}

function isLaunch(value: unknown): value is SavedLaunch {
  if (!value || typeof value !== 'object') return false;
  const launch = value as SavedLaunch;
  return (
    typeof launch.id === 'string' &&
    (launch.mode === 'baseball' || launch.mode === 'projectile') &&
    typeof launch.distanceM === 'number' &&
    typeof launch.hangTimeS === 'number'
  );
}

export function readHistory(): SavedLaunch[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLaunch).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function writeHistory(launches: SavedLaunch[]) {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(launches.slice(0, HISTORY_LIMIT)));
  } catch {
    // The session can fill up. The in-memory list still works for this page.
  }
}
