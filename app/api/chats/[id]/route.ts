import { deleteChat, getChat } from '@/lib/chat';
import { visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = visitorRoute(async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = getChat((await params).id);
  return c ? Response.json(c) : Response.json({ error: 'Not found' }, { status: 404 });
});

export const DELETE = visitorRoute(async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  deleteChat((await params).id);
  return Response.json({ ok: true });
});
