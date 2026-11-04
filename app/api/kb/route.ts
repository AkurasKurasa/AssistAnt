import { addDoc, listDocs, removeDoc, stats } from '@/lib/kb';
import { PUBLIC_DEMO, visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEXT = /\.(md|markdown|txt|csv|json|html?)$/i;

export const GET = visitorRoute(async function GET() {
  const docs = listDocs().map(({ chunks, ...d }) => ({ ...d, parts: chunks.length }));
  const { chunks } = stats();
  return Response.json({ docs, parts: chunks });
});

// Upload files (multipart "files") or paste text ({ title, text }).
export const POST = visitorRoute(async function POST(req: Request) {
  // The public demo's disk is shared and small, so each visitor gets a modest Knowledge Base.
  if (PUBLIC_DEMO && listDocs().length >= 25) return Response.json({ error: 'The demo keeps up to 25 notes. Remove one first.' }, { status: 429 });
  const added: string[] = [], skipped: string[] = [];
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const form = await req.formData();
    for (const f of form.getAll('files')) {
      if (typeof f === 'string') continue;
      if (!TEXT.test(f.name) || f.size > 2_000_000) { skipped.push(f.name); continue; }
      let text = await f.text();
      if (/\.html?$/i.test(f.name)) text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
      addDoc(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s[0-9a-f]{32}$/i, '').trim(), text, 'upload');
      added.push(f.name);
    }
  } else {
    const { title, text } = await req.json();
    if (!String(text || '').trim()) return Response.json({ error: 'Paste some text first.' }, { status: 400 });
    addDoc(String(title || 'Pasted note').slice(0, 120), String(text), 'paste');
    added.push(String(title || 'Pasted note'));
  }
  return Response.json({ added, skipped });
});

export const DELETE = visitorRoute(async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (id) removeDoc(id);
  return GET(req);
});
