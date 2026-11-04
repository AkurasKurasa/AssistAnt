import fs from 'node:fs';
import path from 'node:path';
import { dataDir, visitorId } from './visitor';

// Your Knowledge Base: notes you upload or pull from Notion, stored as JSON in data/knowledge (per visitor in the public demo).
// Search is local keyword ranking (BM25), so it's free, private and works offline.

export interface KbChunk { i: number; text: string }
export interface KbDoc { id: string; title: string; source: 'upload' | 'notion' | 'paste'; addedAt: string; chars: number; chunks: KbChunk[] }
export interface KbHit { docId: string; title: string; chunk: number; text: string; score: number }

const dir = () => dataDir('knowledge');
const STOP = new Set('a an and are as at be but by for from has have he her his i if in into is it its me my of on or our she so that the their them then there these they this to was we were what when where which who why will with you your ang ng sa na at ay mga si ni ko mo ka'.split(' '));

function tokens(s: string): string[] {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}

// Split on blank lines and headings, then pack paragraphs into ~900 character chunks.
export function chunk(text: string): KbChunk[] {
  const paras = text.replace(/\r/g, '').split(/\n\s*\n|\n(?=#)/).map((p) => p.trim()).filter(Boolean);
  const out: KbChunk[] = [];
  let buf = '';
  for (const p of paras) {
    if (buf && buf.length + p.length > 900) { out.push({ i: out.length, text: buf }); buf = ''; }
    if (p.length > 1400) { for (let k = 0; k < p.length; k += 900) out.push({ i: out.length, text: p.slice(k, k + 900) }); continue; }
    buf = buf ? buf + '\n\n' + p : p;
  }
  if (buf) out.push({ i: out.length, text: buf });
  return out;
}

function file(id: string) { return path.join(dir(), id.replace(/[^a-z0-9-]/gi, '') + '.json'); }

export function listDocs(): KbDoc[] {
  try {
    return fs.readdirSync(dir()).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8')) as KbDoc)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  } catch { return []; }
}

export function addDoc(title: string, text: string, source: KbDoc['source']): KbDoc {
  fs.mkdirSync(dir(), { recursive: true });
  const clean = text.replace(/\u0000/g, '').trim();
  // Re-uploading a note with the same title replaces it.
  const existing = listDocs().find((d) => d.title.toLowerCase() === title.toLowerCase());
  const doc: KbDoc = { id: existing?.id || Math.random().toString(36).slice(2, 10), title, source, addedAt: new Date().toISOString(), chars: clean.length, chunks: chunk(clean) };
  fs.writeFileSync(file(doc.id), JSON.stringify(doc));
  indexes.delete(visitorId());
  return doc;
}

export function removeDoc(id: string): void {
  try { fs.unlinkSync(file(id)); } catch { /* already gone */ }
  indexes.delete(visitorId());
}

interface Index { rows: { docId: string; title: string; chunk: number; text: string; tf: Map<string, number>; len: number }[]; df: Map<string, number>; avg: number }
const indexes = new Map<string, Index>();

function build(): Index {
  const rows: Index['rows'] = [];
  const df = new Map<string, number>();
  for (const d of listDocs()) for (const c of d.chunks) {
    const toks = tokens(d.title + ' ' + c.text);
    const tf = new Map<string, number>();
    toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1));
    rows.push({ docId: d.id, title: d.title, chunk: c.i, text: c.text, tf, len: toks.length });
  }
  return { rows, df, avg: rows.reduce((s, r) => s + r.len, 0) / Math.max(1, rows.length) };
}

export function search(query: string, k = 5): { hits: KbHit[]; terms: string[] } {
  let index = indexes.get(visitorId());
  if (!index) { index = build(); indexes.set(visitorId(), index); }
  const terms = [...new Set(tokens(query))];
  const N = index.rows.length, k1 = 1.4, b = 0.75;
  const scored = index.rows.map((r) => {
    let s = 0;
    for (const t of terms) {
      const f = r.tf.get(t); if (!f) continue;
      const n = index!.df.get(t) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * r.len) / index!.avg)));
    }
    return { docId: r.docId, title: r.title, chunk: r.chunk, text: r.text, score: s };
  }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score);
  return { hits: scored.slice(0, k), terms };
}

export function stats() {
  const docs = listDocs();
  return { docs: docs.length, chunks: docs.reduce((s, d) => s + d.chunks.length, 0) };
}
