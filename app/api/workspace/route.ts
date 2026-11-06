import { workspace } from '@/lib/workspace';
import { demoView } from '@/lib/workspace/demo';
import { visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// What the fake Notion, Sheets and Docs hold right now, and what the crew changed, for the Live view.
// Only the demo workspace can be shown this way; a real Notion workspace is never exposed here.
export const GET = visitorRoute(async function GET() {
  if (workspace().mode !== 'demo') return Response.json({ mode: 'notion' });
  return Response.json({ mode: 'demo', ...demoView() });
});
