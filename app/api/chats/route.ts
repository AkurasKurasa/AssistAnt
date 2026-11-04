import { listChats } from '@/lib/chat';
import { visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = visitorRoute(async function GET() {
  return Response.json({ chats: listChats() });
});
