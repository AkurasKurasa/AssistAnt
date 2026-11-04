import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Local mode with keys "set", so Groq and Gemini count as available. No real calls are made:
// every provider's call() is replaced, and fetch is stubbed where post() is under test.
vi.stubEnv('PUBLIC_DEMO', '');
vi.stubEnv('GROQ_API_KEY', 'test-groq');
vi.stubEnv('GEMINI_API_KEY', 'test-gemini');
vi.stubEnv('CLAUDE_CODE_ENABLED', 'false');

const home = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-router-'));

type P = typeof import('../lib/llm/providers');
type R = typeof import('../lib/llm/router');
let providers: P, router: R;
const calls: { id: string; tier?: string }[] = [];

function behave(map: Record<string, 'ok' | 'limit' | 'fail'>) {
  for (const id of Object.keys(providers.PROVIDERS)) {
    providers.PROVIDERS[id].call = async (_p, _s, tier) => {
      calls.push({ id, tier });
      const how = map[id] ?? 'fail';
      if (how === 'limit') throw new providers.RateLimitError('limit');
      if (how === 'fail') throw new Error('boom');
      return `answer from ${id}`;
    };
  }
}

beforeAll(async () => {
  process.chdir(tmp); // usage counters go to a throwaway data/state.json
  providers = await import('../lib/llm/providers');
  router = await import('../lib/llm/router');
});
afterAll(() => { process.chdir(home); fs.rmSync(tmp, { recursive: true, force: true }); });
beforeEach(async () => {
  calls.length = 0;
  const { getState } = await import('../lib/state');
  const s = getState(); s.exhausted = {}; s.usage = {};
});

describe('climbing one tier when a model hits its limit', () => {
  it('fast: Groq 20b at its limit goes up to Gemini Flash, asked as the smart tier', async () => {
    behave({ groq20: 'limit', flash: 'ok', lite: 'ok' });
    const notes: string[] = [];
    const r = await router.ask('fast', 'hi', undefined, (m) => notes.push(m));
    expect(r?.text).toBe('answer from flash');
    expect(calls.map((c) => c.id)).toEqual(['groq20', 'flash']);
    expect(calls[1].tier).toBe('smart');
    expect(notes[0]).toMatch(/hit its limit, so this went up to Google Gemini Flash/);
  });

  it('keeps climbing through the better models, then returns to its own line', async () => {
    behave({ groq20: 'limit', flash: 'limit', groq120: 'limit', lite: 'ok' });
    const r = await router.ask('fast', 'hi');
    expect(calls.map((c) => c.id)).toEqual(['groq20', 'flash', 'groq120', 'lite']);
    expect(r?.text).toBe('answer from lite');
  });

  it('a model already used up today counts as a limit too', async () => {
    const { markExhausted } = await import('../lib/state');
    markExhausted('groq20');
    behave({ flash: 'ok' });
    expect((await router.ask('fast', 'hi'))?.text).toBe('answer from flash');
    expect(calls.map((c) => c.id)).toEqual(['flash']);
  });

  it('a broken model (not a limit) does not climb; it just moves down the line', async () => {
    behave({ groq20: 'fail', lite: 'ok' });
    expect((await router.ask('fast', 'hi'))?.text).toBe('answer from lite');
    expect(calls.map((c) => c.id)).toEqual(['groq20', 'lite']);
  });

  it('only climbs one tier and never borrows the paid Claude API', () => {
    expect(router.betterThan('fast')).toEqual({ tier: 'smart', ids: ['flash', 'groq120'] });
    expect(router.betterThan('smart')).toEqual({ tier: 'best', ids: ['claudesub'] });
    expect(router.betterThan('best')).toBeNull();
  });
});

describe('recognising a limit', () => {
  const groq = () => providers.PROVIDERS.groq20;
  const reply = (status: number, body: string) => vi.stubGlobal('fetch', async () => new Response(body, { status }));

  beforeAll(async () => {
    vi.resetModules();
    providers = await import('../lib/llm/providers'); // fresh call() functions, not the stubs above
  });

  it.each([
    [429, 'slow down'],
    [402, 'payment required'],
    [403, 'You exceeded your current quota'],
    [400, 'RESOURCE_EXHAUSTED'],
  ])('%i "%s" is a limit', async (status, body) => {
    reply(status, body);
    await expect(groq().call('hi')).rejects.toBeInstanceOf(providers.RateLimitError);
  });

  it.each([[500, 'internal error'], [400, 'bad request: messages missing']])('%i "%s" is a failure, not a limit', async (status, body) => {
    reply(status, body);
    const err = await groq().call('hi').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(providers.RateLimitError);
  });
});
