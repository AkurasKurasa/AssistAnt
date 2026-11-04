import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

// PUBLIC_DEMO=1 is set only on the public host. It runs AssistAnt on fake data with no keys,
// and gives every visitor their own copy. Locally it's off, and everything here is a no-op:
// one visitor ("local"), files in data/ exactly as before.
export const PUBLIC_DEMO = process.env.PUBLIC_DEMO === '1';
export const LOCAL = 'local';

const store = new AsyncLocalStorage<string>();
const ID = /^[a-z0-9-]{8,64}$/i;

export function visitorId(): string {
  return store.getStore() || LOCAL;
}

export function runAs<T>(id: string, fn: () => T): T {
  return store.run(id, fn);
}

// data/<parts> locally; data/visitors/<id>/<parts> in the public demo.
export function dataDir(...parts: string[]): string {
  const base = path.join(process.cwd(), 'data');
  return PUBLIC_DEMO ? path.join(base, 'visitors', visitorId(), ...parts) : path.join(base, ...parts);
}

// Wraps a route handler so everything it starts (including background runs) knows the visitor.
// The ID comes from middleware.ts, which overwrites any x-visitor-id the browser sends.
export function visitorRoute<A extends unknown[]>(fn: (req: Request, ...rest: A) => Promise<Response>) {
  return (req: Request, ...rest: A): Promise<Response> => {
    const raw = req.headers.get('x-visitor-id') || '';
    return runAs(PUBLIC_DEMO && ID.test(raw) ? raw : LOCAL, () => fn(req, ...rest));
  };
}

// Small in-memory rate limit for the public demo, so one visitor can't hammer the free gateways.
const hits = new Map<string, number[]>();

export function tooFast(req: Request, limit = 20, windowMs = 60_000): boolean {
  if (!PUBLIC_DEMO) return false;
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  // Per visitor, plus a looser cap per IP so clearing cookies doesn't reset it.
  const caps: { key: string; max: number }[] = [{ key: 'v:' + visitorId(), max: limit }, { key: 'ip:' + ip, max: limit * 3 }];
  return caps.map(({ key, max }) => {
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > max;
  }).some(Boolean);
}
