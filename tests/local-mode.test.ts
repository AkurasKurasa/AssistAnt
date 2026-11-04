import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Without PUBLIC_DEMO, the visitor layer must change nothing: one user, files in data/.
vi.stubEnv('PUBLIC_DEMO', '');

describe('local mode is unchanged', () => {
  it('keeps files in data/ and ignores visitor IDs', async () => {
    const v = await import('../lib/visitor');
    expect(v.PUBLIC_DEMO).toBe(false);
    expect(v.dataDir('chats')).toBe(path.join(process.cwd(), 'data', 'chats'));
    const route = v.visitorRoute(async () => new Response(v.visitorId()));
    const res = await route(new Request('http://x', { headers: { 'x-visitor-id': 'visitor-aaaa-1111' } }));
    expect(await res.text()).toBe(v.LOCAL);
  });

  it('never rate limits you', async () => {
    const v = await import('../lib/visitor');
    const req = new Request('http://x');
    expect(Array.from({ length: 50 }, () => v.tooFast(req, 1)).some(Boolean)).toBe(false);
  });

  it('still reads Notion settings from the environment', async () => {
    vi.stubEnv('WORKSPACE', 'demo');
    const { connectors } = await import('../lib/connectors');
    expect(connectors().find((c) => c.id === 'notion')?.setup).toMatch(/\.env\.local/);
  });
});
