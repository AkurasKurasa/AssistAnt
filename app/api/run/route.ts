import { startRun } from '@/lib/engine/orchestrator';
import { activeRun } from '@/lib/engine/run';
import { tooFast, visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = visitorRoute(async function POST(req: Request) {
  if (tooFast(req, 10)) return Response.json({ error: 'That’s a lot of runs. Give it a minute.' }, { status: 429 });
  const { task } = await req.json().catch(() => ({ task: '' }));
  const text = String(task || '').trim().slice(0, 500);
  if (!text) return Response.json({ error: 'Type a task first.' }, { status: 400 });
  const busy = activeRun();
  if (busy) return Response.json({ error: 'The crew is still working on the last task.', id: busy.id }, { status: 409 });
  const run = startRun(text);
  return Response.json({ id: run.id });
});
