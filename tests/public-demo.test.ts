import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// PUBLIC_DEMO is read when lib/visitor.ts loads, so set the environment first and import after.
// Real-looking keys are set on purpose: the demo must never use or send them.
vi.stubEnv('PUBLIC_DEMO', '1');
vi.stubEnv('WORKSPACE', 'notion');
vi.stubEnv('NOTION_TOKEN', 'secret-notion');
vi.stubEnv('NOTION_TASKS_PAGE_ID', 'p1');
vi.stubEnv('NOTION_REMINDERS_DB_ID', 'p2');
vi.stubEnv('NOTION_NOTES_PAGE_ID', 'p3');
vi.stubEnv('GROQ_API_KEY', 'secret-groq');
vi.stubEnv('GEMINI_API_KEY', 'secret-gemini');
vi.stubEnv('KILO_API_KEY', 'secret-kilo');

const A = 'visitor-aaaa-1111';
const B = 'visitor-bbbb-2222';
const home = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-demo-'));

let v: typeof import('../lib/visitor');
beforeAll(async () => {
  process.chdir(tmp);
  v = await import('../lib/visitor');
});
afterAll(() => {
  process.chdir(home);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('public demo: visitors are kept apart', () => {
  it('puts each visitor’s files in their own folder', () => {
    expect(v.runAs(A, () => v.dataDir('chats'))).toBe(path.join(tmp, 'data', 'visitors', A, 'chats'));
  });

  it('keeps chats private', async () => {
    const { newChat, saveChat, listChats } = await import('../lib/chat');
    v.runAs(A, () => saveChat(newChat('my secret question')));
    expect(v.runAs(A, listChats)).toHaveLength(1);
    expect(v.runAs(B, listChats)).toHaveLength(0);
  });

  it('keeps the Knowledge Base private', async () => {
    const { addDoc, search } = await import('../lib/kb');
    v.runAs(A, () => addDoc('Project notes', 'The team wants chapter three revisions.', 'paste'));
    expect(v.runAs(A, () => search('chapter revisions').hits)).toHaveLength(1);
    expect(v.runAs(B, () => search('chapter revisions').hits)).toHaveLength(0);
  });

  it('gives each visitor their own fake workspace', async () => {
    const { workspace } = await import('../lib/workspace');
    await v.runAs(A, () => workspace().addGroceries(['mango']));
    expect(await v.runAs(A, () => workspace().getGroceries())).toContain('mango');
    expect(await v.runAs(B, () => workspace().getGroceries())).not.toContain('mango');
  });

  it('only lets the owner watch or answer a run', async () => {
    const { Run, runs, ownRun, activeRun } = await import('../lib/engine/run');
    const run = v.runAs(A, () => new Run('wrap up'));
    runs.set(run.id, run);
    expect(v.runAs(A, () => ownRun(run.id))).toBe(run);
    expect(v.runAs(B, () => ownRun(run.id))).toBeNull();
    expect(v.runAs(B, activeRun)).toBeNull(); // A's run doesn't block B
  });

  it('saves learned routines per visitor, never into the shared routines/ folder', async () => {
    const { saveRoutine, loadRoutines } = await import('../lib/engine/routines');
    v.runAs(A, () => saveRoutine('water-plants', 'Water plants', ['water'], '1. Water them.'));
    expect(fs.existsSync(path.join(tmp, 'routines'))).toBe(false);
    expect(v.runAs(A, loadRoutines).map((r) => r.slug)).toContain('water-plants');
    expect(v.runAs(B, loadRoutines).map((r) => r.slug)).not.toContain('water-plants');
  });
});

describe('public demo: no real data or keys', () => {
  it('uses the fake workspace even when Notion is configured', async () => {
    const { workspace } = await import('../lib/workspace');
    expect(workspace().mode).toBe('demo');
  });

  it('shows Notion and Sheets as connected to sample data, nothing else', async () => {
    const { connectors } = await import('../lib/connectors');
    const on = connectors().filter((c) => c.connected).map((c) => c.id);
    expect(on.sort()).toEqual(['notion', 'sheets']);
  });

  it('only offers keyless models, switched on', async () => {
    const { allStatus } = await import('../lib/llm/router');
    const list = await v.runAs(A, allStatus);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.keyless && s.on)).toBe(true);
  });

  it('never sends a key, and falls back to plain rules when the gateways are busy', async () => {
    const calls: { url: string; headers: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: JSON.stringify(init?.headers || {}) });
      return new Response('busy', { status: 429 });
    });
    const { ask } = await import('../lib/llm/router');
    const r = await v.runAs(B, () => ask('fast', 'hello'));
    vi.unstubAllGlobals();
    expect(r).toBeNull();
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.url).not.toMatch(/groq|googleapis|anthropic/);
      expect(c.headers).not.toMatch(/secret/);
    }
  });
});

describe('public demo: request handling', () => {
  it('ignores visitor IDs that aren’t a plain random ID', async () => {
    const seen: string[] = [];
    const route = v.visitorRoute(async () => { seen.push(v.visitorId()); return new Response('ok'); });
    await route(new Request('http://x', { headers: { 'x-visitor-id': '../../etc' } }));
    await route(new Request('http://x', { headers: { 'x-visitor-id': A } }));
    expect(seen).toEqual([v.LOCAL, A]);
  });

  it('rate limits a busy visitor', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.9' } });
    const results = v.runAs('visitor-rate-0001', () => Array.from({ length: 4 }, () => v.tooFast(req, 3)));
    expect(results).toEqual([false, false, false, true]);
  });
});
