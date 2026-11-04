import { ownRun } from '@/lib/engine/run';
import type { RunEvent } from '@/lib/types';
import { visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-Sent Events: replays everything so far, then streams new events until the run ends.
export const GET = visitorRoute(async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = ownRun(id);
  if (!run) return new Response('Not found', { status: 404 });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (e: RunEvent) => {
        try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ }
        if (e.t === 'end') { cleanup(); try { ctrl.close(); } catch { /* closed */ } }
      };
      run.events.forEach(send);
      if (run.done) return;
      run.subs.add(send);
      const ping = setInterval(() => { try { ctrl.enqueue(enc.encode(': ping\n\n')); } catch { /* closed */ } }, 15000);
      cleanup = () => { run.subs.delete(send); clearInterval(ping); };
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } });
});
