import { allStatus } from '@/lib/llm/router';
import { setBudget, setOn, getState } from '@/lib/state';
import { workspace } from '@/lib/workspace';
import { CATALOG_UPDATED } from '@/lib/llm/catalog';
import { PUBLIC_DEMO, hasPass, visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = visitorRoute(async function GET() {
  return Response.json({ sources: await allStatus(), budget: getState().claudeBudget, mode: workspace().mode, catalogUpdated: CATALOG_UPDATED, publicDemo: PUBLIC_DEMO, pass: hasPass() });
});

export const PATCH = visitorRoute(async function PATCH(req: Request) {
  const b = await req.json();
  if (typeof b.id === 'string' && typeof b.on === 'boolean') setOn(b.id, b.on);
  if (typeof b.budget === 'number') setBudget(b.budget);
  return GET(req);
});
