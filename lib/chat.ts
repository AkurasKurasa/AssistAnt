import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './visitor';

// Saved chats live in data/chats as one JSON file each (per visitor in the public demo).
export interface Source { n: number; title: string; snippet: string }
export interface Turn { q: string; steps: string[]; answer: string; sources: Source[]; model?: string; run?: { id: string; title: string }; at: string }
export interface Chat { id: string; title: string; createdAt: string; updatedAt: string; turns: Turn[] }

const dir = () => dataDir('chats');
const file = (id: string) => path.join(dir(), id.replace(/[^a-z0-9]/gi, '') + '.json');

export function getChat(id: string): Chat | null {
  try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; }
}

export function newChat(firstQuestion: string): Chat {
  const now = new Date().toISOString();
  return { id: Math.random().toString(36).slice(2, 10), title: firstQuestion.slice(0, 70), createdAt: now, updatedAt: now, turns: [] };
}

export function saveChat(c: Chat): void {
  fs.mkdirSync(dir(), { recursive: true });
  c.updatedAt = new Date().toISOString();
  fs.writeFileSync(file(c.id), JSON.stringify(c, null, 1));
}

export function listChats(): { id: string; title: string; updatedAt: string; turns: number }[] {
  try {
    return fs.readdirSync(dir()).filter((f) => f.endsWith('.json'))
      .map((f) => { const c = JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8')) as Chat; return { id: c.id, title: c.title, updatedAt: c.updatedAt, turns: c.turns.length }; })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch { return []; }
}

export function deleteChat(id: string): void { try { fs.unlinkSync(file(id)); } catch { /* gone */ } }
