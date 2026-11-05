import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DEMO, dataDir } from '../visitor';

export interface Routine {
  slug: string;
  name: string;
  flow: string;
  triggers: RegExp[];
  body: string;
}

const DIR = path.join(process.cwd(), 'routines');

// Routines are markdown files with a small front matter block:
// ---
// name: Finish day
// flow: finish-day
// triggers: finish, wrap up, end of (my )?day
// ---
// In the public demo, routines a visitor saves live in their own folder, next to the built-in ones.
const saveDir = () => (PUBLIC_DEMO ? dataDir('routines') : DIR);

export function loadRoutines(): Routine[] {
  return PUBLIC_DEMO ? [...readRoutines(DIR), ...readRoutines(saveDir())] : readRoutines(DIR);
}

function readRoutines(dir: string): Routine[] {
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { return []; }
  return files.map((f) => {
    // Git on Windows may check these out with CRLF line endings; parse them the same either way.
    const raw = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const meta: Record<string, string> = {};
    (m ? m[1] : '').split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    const triggers = (meta.triggers || '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => new RegExp(t, 'i'));
    return { slug: f.replace(/\.md$/, ''), name: meta.name || f, flow: meta.flow || 'generic', triggers, body: (m ? m[2] : raw).trim() };
  });
}

export function matchRoutine(task: string): Routine | null {
  for (const r of loadRoutines()) if (r.triggers.some((t) => t.test(task))) return r;
  return null;
}

export function saveRoutine(slug: string, name: string, triggers: string[], body: string): void {
  fs.mkdirSync(saveDir(), { recursive: true });
  const fm = `---\nname: ${name}\nflow: generic\ntriggers: ${triggers.join(', ')}\n---\n`;
  fs.writeFileSync(path.join(saveDir(), slug + '.md'), fm + body.trim() + '\n');
}
