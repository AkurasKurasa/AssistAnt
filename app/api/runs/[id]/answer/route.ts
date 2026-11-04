import { ownRun } from '@/lib/engine/run';
import { visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = visitorRoute(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = ownRun(id);
  if (!run) return Response.json({ error: 'That run has ended.' }, { status: 404 });
  const { ask, value } = await req.json();
  return run.answer(String(ask), value) ? Response.json({ ok: true }) : Response.json({ error: 'Already answered.' }, { status: 409 });
});
