import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// "Your results are ready!": a finished run becomes the first answer of a new chat.
vi.stubEnv('PUBLIC_DEMO', '1');
const home = process.cwd(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-seed-'));
beforeAll(() => process.chdir(tmp));
afterAll(() => { process.chdir(home); fs.rmSync(tmp, { recursive: true, force: true }); });

const post = async (visitor: string, body: unknown) => {
  const { POST } = await import('../app/api/chats/route');
  return POST(new Request('http://x/api/chats', { method: 'POST', headers: { 'x-visitor-id': visitor, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
};

describe('starting a chat from a run', () => {
  it('saves the result as the first answer, linked to the run', async () => {
    const r = await post('visitor-seed-aaaa', { seed: { q: 'Add pears to groceries', answer: 'Added pears.\n\nWhat changed:\n- Added pears to the Grocery List', runId: 'run12345', title: 'Groceries' } });
    expect(r.status).toBe(200);
    const { id } = await r.json();
    const { runAs } = await import('../lib/visitor');
    const { getChat } = await import('../lib/chat');
    const chat = runAs('visitor-seed-aaaa', () => getChat(id));
    expect(chat?.turns[0]).toMatchObject({ q: 'Add pears to groceries', answer: expect.stringContaining('What changed'), run: { id: 'run12345', title: 'Groceries' }, steps: ['Ran the Groceries routine.'] });
    expect(runAs('visitor-seed-bbbb', () => getChat(id))).toBeNull(); // another visitor can't open it
  });

  it('rejects a seed without a question or an answer', async () => {
    expect((await post('visitor-seed-aaaa', { seed: { q: 'x' } })).status).toBe(400);
    expect((await post('visitor-seed-aaaa', {})).status).toBe(400);
  });
});
