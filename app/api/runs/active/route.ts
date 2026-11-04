import { activeRun } from '@/lib/engine/run';
import { visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = visitorRoute(async function GET() {
  const r = activeRun();
  return Response.json(r ? { id: r.id, task: r.task } : {});
});
