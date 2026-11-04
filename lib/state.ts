import fs from 'node:fs';
import path from 'node:path';
import { today } from './time';
import { dataDir, visitorId } from './visitor';

// Small JSON store in data/state.json: model usage per day, on/off switches, Claude budget.
// In the public demo each visitor gets their own (see lib/visitor.ts).
export interface AppState {
  day: string;
  usage: Record<string, number>;
  exhausted: Record<string, boolean>;
  on: Record<string, boolean>;
  claudeBudget: number;
  lastScheduled: Record<string, string>;
}

const file = () => dataDir('state.json');

// Switches you haven't touched fall back to each provider's own default.
const DEFAULT_ON: Record<string, boolean> = {};

function fresh(): AppState {
  return { day: today(), usage: {}, exhausted: {}, on: { ...DEFAULT_ON }, claudeBudget: Number(process.env.CLAUDE_DAILY_BUDGET || 25), lastScheduled: {} };
}

const caches = new Map<string, AppState>();

export function getState(): AppState {
  let s = caches.get(visitorId());
  if (!s) {
    try { s = { ...fresh(), ...JSON.parse(fs.readFileSync(file(), 'utf8')) } as AppState; } catch { s = fresh(); }
    caches.set(visitorId(), s);
  }
  if (s.day !== today()) { s.day = today(); s.usage = {}; s.exhausted = {}; save(); }
  return s;
}

export function save(): void {
  const cache = caches.get(visitorId());
  if (!cache) return;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch { /* read-only disk: keep it in memory */ }
}

export function bump(id: string): void { const s = getState(); s.usage[id] = (s.usage[id] || 0) + 1; save(); }
export function markExhausted(id: string): void { getState().exhausted[id] = true; save(); }
export function setOn(id: string, on: boolean): void { getState().on[id] = on; save(); }
export function setBudget(n: number): void { getState().claudeBudget = Math.max(5, Math.min(200, Math.round(n))); save(); }
