import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The public showcase with an access code: visitors with the pass get the keyed providers set on
// the host (including a FreeLLMAPI router); everyone else stays on keyless models, keys never sent.
vi.stubEnv('PUBLIC_DEMO', '1');
vi.stubEnv('DEMO_ACCESS_CODE', 'prof-code-123');
vi.stubEnv('GROQ_API_KEY', 'secret-groq');
vi.stubEnv('FREELLMAPI_URL', 'http://router.test');
vi.stubEnv('FREELLMAPI_KEY', 'secret-freellm');

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const GUEST = 'visitor-guest-0001', PROF = 'visitor-prof-0001';
const home = process.cwd(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-pass-'));
let v: typeof import('../lib/visitor');

// Requests the fake upstreams receive: groq is busy (429), the router lists 3 models and answers.
const calls: { url: string; auth: string; model?: string }[] = [];
beforeAll(async () => {
  process.chdir(tmp);
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url: String(url), auth: headers.authorization || '', model: body.model });
    if (String(url).includes('router.test/v1/models')) return Response.json({ data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    if (String(url).includes('router.test/v1/chat/completions')) return Response.json({ choices: [{ message: { content: 'from the router' } }] });
    return new Response('busy', { status: 429 });
  });
  v = await import('../lib/visitor');
});
afterEach(() => { calls.length = 0; });
afterAll(() => { vi.unstubAllGlobals(); process.chdir(home); fs.rmSync(tmp, { recursive: true, force: true }); });

const asRoute = async (cookie: string) => {
  let pass: boolean | undefined;
  await v.visitorRoute(async () => { pass = v.hasPass(); return new Response('ok'); })(new Request('http://x', { headers: { 'x-visitor-id': PROF, cookie } }));
  return pass;
};

describe('showcase access pass', () => {
  it('is granted only by the right code’s hash', async () => {
    expect(await asRoute(`aa_vid=${PROF}; aa_pass=${sha('prof-code-123')}`)).toBe(true);
    expect(await asRoute(`aa_pass=${sha('wrong-code')}`)).toBe(false);
    expect(await asRoute('')).toBe(false);
  });

  it('without the pass: keyless models only, and no key is ever sent', async () => {
    const { allStatus, ask } = await import('../lib/llm/router');
    const list = await v.runAs(GUEST, allStatus);
    expect(list.every((s) => s.keyless)).toBe(true);
    await v.runAs(GUEST, () => ask('fast', 'hi'));
    expect(calls.some((c) => /secret/.test(c.auth))).toBe(false);
    expect(calls.some((c) => c.url.includes('router.test'))).toBe(false);
  });

  it('with the pass: keyed providers and the FreeLLMAPI router, never the local-only ones', async () => {
    const { allStatus } = await import('../lib/llm/router');
    const ids = (await v.runAs(PROF, allStatus, true)).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['freellmapi', 'groq20', 'groq120']));
    for (const local of ['claudesub', 'ollama', 'claudeapi']) expect(ids).not.toContain(local);
  });

  it('with the pass: a busy Groq falls through to the router, which gets its own key and model "auto"', async () => {
    const { ask, status } = await import('../lib/llm/router');
    const r = await v.runAs(PROF, () => ask('fast', 'hi'), true);
    expect(r?.text).toBe('from the router');
    expect(calls.find((c) => c.url.includes('api.groq.com'))?.auth).toBe('Bearer secret-groq');
    expect(calls.find((c) => c.url === 'http://router.test/v1/chat/completions')).toMatchObject({ auth: 'Bearer secret-freellm', model: 'auto' });
    expect((await v.runAs(PROF, () => status('freellmapi'), true)).detail).toMatch(/routes across 3 models/);
  });
});
