import { listChats, newChat, saveChat, type Turn } from '@/lib/chat';
import { visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = visitorRoute(async function GET() {
  return Response.json({ chats: listChats() });
});

// Start a chat from a finished run: the run's result becomes the first answer, so follow-up
// questions have it as context. Body: { seed: { q, answer, runId, title } }.
export const POST = visitorRoute(async function POST(req: Request) {
  const { seed } = await req.json().catch(() => ({ seed: null }));
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const q = str(seed?.q, 500), answer = str(seed?.answer, 6000), runId = str(seed?.runId, 40), title = str(seed?.title, 120);
  if (!q || !answer) return Response.json({ error: 'A finished run is needed to start this chat.' }, { status: 400 });
  const chat = newChat(q);
  const turn: Turn = { q, steps: [`Ran the ${title || 'requested'} routine.`], answer, sources: [], at: new Date().toISOString(), ...(runId ? { run: { id: runId, title: title || q } } : {}) };
  chat.turns.push(turn);
  saveChat(chat);
  return Response.json({ id: chat.id });
});
