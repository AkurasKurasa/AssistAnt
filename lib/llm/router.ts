import type { Tier } from '../types';
import { PROVIDERS, ORDER, RateLimitError, type ProviderId } from './providers';
import { CATALOG_ORDER } from './catalog';
import { getState, bump, markExhausted } from '../state';
import { PUBLIC_DEMO } from '../visitor';

// The public demo holds no keys, so it only offers the keyless free gateways, then plain rules.
const offered = (id: ProviderId) => !PUBLIC_DEMO || !!PROVIDERS[id].keyless;

// Each agent asks for a line of models. The router takes the first one that's available.
// Free providers from the awesome-free-llm-apis list slot in after Groq and Gemini.
export const CHAINS: Record<Exclude<Tier, 'code'>, ProviderId[]> = {
  best: ['claudesub', 'groq120', ...CATALOG_ORDER, 'openrouter', 'ollama'],
  smart: ['flash', 'groq120', ...CATALOG_ORDER, 'openrouter', 'ollama', 'claudeapi'],
  fast: ['groq20', 'lite', 'qwen', ...CATALOG_ORDER, 'openrouter', 'ollama', 'claudeapi'],
};

// When a model hits its limit, climb one tier for a better model before going down the line:
// fast borrows smart's own models (Gemini Flash, Groq 120b), smart borrows best's (your Claude plan).
// Only one tier, so quick jobs never burn the scarcest quotas. The paid Claude API is never borrowed.
const UP: Partial<Record<Exclude<Tier, 'code'>, Exclude<Tier, 'code'>>> = { fast: 'smart', smart: 'best' };

export function betterThan(tier: Exclude<Tier, 'code'>): { tier: Exclude<Tier, 'code'>; ids: ProviderId[] } | null {
  const up = UP[tier];
  if (!up) return null;
  return { tier: up, ids: CHAINS[up].filter((id) => !CHAINS[tier].includes(id) && !PROVIDERS[id].paid) };
}

export type Health = 'ok' | 'full' | 'off' | 'nokey' | 'offline';

export interface SourceStatus {
  id: ProviderId; vendor: string; name: string; short: string;
  health: Health; label: string; detail: string;
  used: number; cap: number; on: boolean; paid?: boolean; sub?: boolean; configurable: boolean;
  keyUrl?: string; trains?: boolean; keyless?: boolean; catalog?: boolean;
}

export async function status(id: ProviderId): Promise<SourceStatus> {
  const p = PROVIDERS[id], s = getState();
  const used = s.usage[id] || 0;
  const cap = p.sub ? s.claudeBudget : p.cap;
  const on = s.on[id] ?? (PUBLIC_DEMO && p.keyless ? true : p.defaultOn !== false);
  const base = { id, vendor: p.vendor, name: p.name, short: p.short, used, cap, on, paid: p.paid, sub: p.sub, keyUrl: p.keyUrl, trains: p.trains, keyless: p.keyless, catalog: p.catalog };
  const setup = await p.setup();
  if (!setup.ok) {
    const offline = id === 'ollama' || id === 'claudesub';
    return { ...base, health: offline ? 'offline' : 'nokey', label: offline ? 'Offline' : 'Not set up', detail: setup.why || '', configurable: false };
  }
  if (!on) return { ...base, health: 'off', label: p.paid ? 'Off, paid' : 'Off', detail: p.paid ? 'Paid per use · off' : p.keyless ? 'No key needed · off until you switch it on' : 'Off', configurable: true };
  if (s.exhausted[id] || (cap > 0 && used >= cap)) {
    return { ...base, health: 'full', label: p.sub ? 'Daily limit reached' : 'Used up today', detail: p.sub ? 'Daily limit reached' : 'Used up today' + (p.reset ? ' · ' + p.reset : ''), configurable: true };
  }
  const detail = p.sub ? `Via Claude Code · ${used} of ${cap} today` : p.paid ? 'Paid per use' : cap ? `${used.toLocaleString()} of ${cap.toLocaleString()} today` : `${used} today${p.keyless ? ' · no key' : ''}`;
  return { ...base, health: 'ok', label: 'Available', detail, configurable: true };
}

export async function allStatus(): Promise<SourceStatus[]> {
  return Promise.all(ORDER.filter(offered).map(status));
}

export interface AskResult { text: string; model: string }

// Ask a tier for an answer. Returns null if nothing is available, so callers fall back to plain rules.
export async function ask(tier: Exclude<Tier, 'code'>, prompt: string, system?: string, onSwitch?: (msg: string) => void): Promise<AskResult | null> {
  let skipped: string[] = [];
  let limitHit: string | null = null; // first model in the line that was at its limit
  const line: { id: ProviderId; tier: Exclude<Tier, 'code'> }[] = CHAINS[tier].filter(offered).map((id) => ({ id, tier }));
  const better = betterThan(tier);
  let climbed = false;
  for (let i = 0; ; i++) {
    // The first time a limit is hit, try the next tier's better models right after it.
    if (limitHit && !climbed && better) {
      climbed = true;
      line.splice(i, 0, ...better.ids.filter(offered).filter((b) => !line.some((l) => l.id === b)).map((b) => ({ id: b, tier: better.tier })));
    }
    if (i >= line.length) break;
    const { id, tier: asTier } = line[i];
    const st = await status(id);
    if (st.health !== 'ok') {
      if (st.health === 'full') limitHit ??= `${st.vendor} ${st.name}`;
      skipped.push(`${st.vendor} ${st.name} is ${st.label.toLowerCase()}`);
      continue;
    }
    try {
      const text = await PROVIDERS[id].call(prompt, system, asTier);
      if (!text) throw new Error('empty reply');
      bump(id);
      if (onSwitch && limitHit && asTier !== tier) onSwitch(`${limitHit} hit its limit, so this went up to ${st.vendor} ${st.name}.`);
      else if (skipped.length && onSwitch) onSwitch(`${skipped[0]}, so this went to ${st.vendor} ${st.name}.`);
      return { text, model: st.short };
    } catch (e) {
      if (e instanceof RateLimitError) { markExhausted(id); limitHit ??= `${st.vendor} ${st.name}`; }
      skipped.push(`${st.vendor} ${st.name} ${e instanceof RateLimitError ? 'hit its limit' : 'failed'}`);
    }
  }
  if (onSwitch) onSwitch('No model is available right now, so this step used plain rules.');
  return null;
}

// Pull the first JSON value out of a model reply.
export function parseJSON<T>(text: string, fallback: T): T {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = m ? m[1] : text;
  const start = raw.search(/[\[{]/);
  if (start < 0) return fallback;
  try { return JSON.parse(raw.slice(start, Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}')) + 1)); } catch { return fallback; }
}
