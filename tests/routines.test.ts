import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../lib/types';

// Every built-in routine, end to end, on the showcase's sample data. Models are "busy" (429),
// so each step takes its plain-rules fallback; the FX lookup gets a fixed rate.
vi.stubEnv('PUBLIC_DEMO', '1');
vi.stubEnv('WALLET_CURRENCY', 'EUR');

const home = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-routines-'));

beforeAll(() => {
  fs.cpSync(path.join(home, 'routines'), path.join(tmp, 'routines'), { recursive: true });
  process.chdir(tmp);
  vi.stubGlobal('fetch', async (url: string) =>
    String(url).includes('open.er-api.com') ? Response.json({ rates: { EUR: 0.92 } }) : new Response('busy', { status: 429 }));
});
afterAll(() => { vi.unstubAllGlobals(); process.chdir(home); fs.rmSync(tmp, { recursive: true, force: true }); });

// Runs a task as one visitor, approving everything and filling forms with sample numbers.
async function run(task: string, visitor: string): Promise<RunEvent[]> {
  const { runAs } = await import('../lib/visitor');
  const { startRun } = await import('../lib/engine/orchestrator');
  return runAs(visitor, () => new Promise<RunEvent[]>((resolve) => {
    const r = startRun(task);
    r.subs.add((e) => {
      if (e.t === 'ask') setTimeout(() => r.answer(e.id, e.kind === 'approve' ? e.items.map(() => true) : Object.fromEntries(e.fields.map((f) => [f.key, f.placeholder || '1, 2, 0']))));
      if (e.t === 'end') resolve(r.events);
    });
  }));
}

const result = (ev: RunEvent[]) => ev.find((e): e is Extract<RunEvent, { t: 'result' }> => e.t === 'result');

describe('every built-in routine runs on the sample data', () => {
  it.each([
    ['Run my finish-day', 'Finish day'],
    ['Give me my morning brief', 'Morning brief'],
    ['What’s due this week?', "What's due"],
    ['Add mangoes and cilantro to groceries', 'Groceries'],
    ['Add call the dentist to tomorrow', 'Add a task'],
    ['Log my portfolio', 'Portfolio'],
  ])('"%s" → %s', async (task, title) => {
    const ev = await run(task, 'visitor-routines-' + title.replace(/\W/g, '').toLowerCase().padEnd(8, 'x'));
    expect(ev.find((e) => e.t === 'plan')).toMatchObject({ title });
    expect(ev.filter((e) => e.t === 'error')).toEqual([]);
    expect(result(ev)?.say).toBeTruthy();
    expect(ev.at(-1)?.t).toBe('end');
  });

  it('portfolio converts the wallet at the day’s rate and uses the generic account names', async () => {
    const ev = await run('Log my portfolio', 'visitor-routines-portfolio2');
    const form = ev.find((e) => e.t === 'ask' && e.kind === 'form');
    expect(JSON.stringify(form)).toMatch(/Broker 1.*Broker 2.*Crypto wallet in EUR/);
    expect(JSON.stringify(ev)).toMatch(/USD\/EUR is 0\.92/);
    // 820+40 + 1540+120 + 97.83+11.96 (each wallet amount rounded to cents) = 2629.79
    expect(result(ev)?.say).toMatch(/Logged today at \$2629\.79/);
  });

  it('logs every change the crew makes, per visitor, for the Live view', async () => {
    const { runAs } = await import('../lib/visitor');
    const { demoView } = await import('../lib/workspace/demo');
    const A = 'visitor-changes-aaaa', B = 'visitor-changes-bbbb';
    await run('Add mangoes to groceries', A);
    const a = runAs(A, demoView);
    expect(a.changes.map((c) => [c.app, c.what])).toContainEqual(['notion', 'Added mangoes to the Grocery List']);
    expect(a.groceries).toContain('mangoes');
    expect(runAs(B, demoView).changes).toEqual([]);
  });

  it('finish-day writes a Daily recap doc and the morning brief saves itself in Docs', async () => {
    const { runAs } = await import('../lib/visitor');
    const { demoView } = await import('../lib/workspace/demo');
    const V = 'visitor-docs-cccc';
    await run('Run my finish-day', V);
    await run('Give me my morning brief', V);
    const v = runAs(V, demoView);
    expect(v.docs.map((d) => d.title.split(' · ')[0]).sort()).toEqual(['Daily recap', 'Morning brief']);
    expect(v.docs.find((d) => d.title.startsWith('Daily recap'))?.body).toMatch(/Done today[\s\S]*On tomorrow’s page/);
    const apps = new Set(v.changes.map((c) => c.app));
    expect([...apps].sort()).toEqual(['docs', 'notion']);
  });

  it('the portfolio adds a row to the fake Sheet, after the seeded history', async () => {
    const { runAs } = await import('../lib/visitor');
    const { demoView } = await import('../lib/workspace/demo');
    const V = 'visitor-sheets-dddd';
    expect(runAs(V, demoView).snapshots).toHaveLength(3);
    await run('Log my portfolio', V);
    const v = runAs(V, demoView);
    expect(v.snapshots).toHaveLength(4);
    expect(v.changes.at(-1)).toMatchObject({ app: 'sheets' });
  });

  it('the grocery check skips synonyms of what is already on the list', async () => {
    const ev = await run('Add coriander and eggs to groceries', 'visitor-routines-grocery02');
    expect(result(ev)?.say).toMatch(/Added coriander.*Skipped eggs/);
  });
});
