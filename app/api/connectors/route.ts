import { connectors } from '@/lib/connectors';
import { visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = visitorRoute(async function GET() {
  return Response.json({ connectors: connectors() });
});
