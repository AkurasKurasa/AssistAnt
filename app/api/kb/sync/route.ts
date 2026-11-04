import { addDoc } from '@/lib/kb';
import { workspace } from '@/lib/workspace';
import { visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Copies every page under your Notes page into the Knowledge Base (replacing older copies).
export const POST = visitorRoute(async function POST() {
  try {
    const ws = workspace();
    const notes = await ws.getNotes();
    const added = notes.filter((n) => n.text.trim()).map((n) => addDoc(n.title, n.text, 'notion').title);
    return Response.json({ added, mode: ws.mode });
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Couldn’t read your notes.' }, { status: 500 });
  }
});
