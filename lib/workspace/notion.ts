import type { DayBlock, Item, Note, Reminder } from '../types';
import type { NewTask, Workspace } from './types';
import { weekday } from '../time';
import * as sheets from './sheets';
import { demo } from './demo';

// Real Notion workspace, following the layout described in the /finish-day routine:
//  Tasks page → template toggle "Daily Tasks" with one heading per weekday,
//  and a synced block holding a "Daily Tasks" toggle with one heading per live day.
const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function call(method: string, path: string, body?: unknown): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(API + path, {
      method,
      headers: { authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'notion-version': VERSION, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 1000 * (attempt + 1))); continue; }
    if (!r.ok) throw new Error(`Notion ${method} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  throw new Error('Notion is rate limiting. Try again in a minute.');
}

async function children(id: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const j = await call('GET', `/blocks/${id}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
    out.push(...j.results);
    cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return out;
}

const rich = (b: any) => (b[b.type]?.rich_text || []) as any[];
const text = (b: any) => rich(b).map((t) => t.plain_text).join('').trim();
const isHeading = (b: any) => /^heading_[123]$/.test(b.type);
const struck = (b: any) => rich(b).length > 0 && rich(b).every((t) => t.annotations?.strikethrough);
const norm = (s: string) => s.replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

async function toItems(blocks: any[]): Promise<Item[]> {
  const out: Item[] = [];
  for (const b of blocks) {
    if (b.type !== 'to_do' && b.type !== 'bulleted_list_item' && b.type !== 'paragraph') continue;
    const t = text(b);
    if (!t) continue;
    out.push({ id: b.id, text: t, checked: !!b.to_do?.checked, skipped: struck(b), children: b.has_children ? await toItems(await children(b.id)) : undefined });
  }
  return out;
}

interface Layout { templateToggle: any; liveToggle: any }
let layoutCache: { at: number; v: Layout } | null = null;

async function layout(): Promise<Layout> {
  if (layoutCache && Date.now() - layoutCache.at < 30_000) return layoutCache.v;
  const top = await children(process.env.NOTION_TASKS_PAGE_ID!);
  const isDailyToggle = (b: any) => /daily tasks/i.test(text(b)) && (b.type === 'toggle' || (isHeading(b) && b[b.type].is_toggleable));
  const templateToggle = top.find(isDailyToggle);
  const synced = top.find((b) => b.type === 'synced_block');
  if (!synced) throw new Error('Could not find the synced block on your Tasks page.');
  const sourceId = synced.synced_block?.synced_from?.block_id || synced.id;
  const inside = await children(sourceId);
  const liveToggle = inside.find(isDailyToggle) || { id: sourceId };
  if (!templateToggle) throw new Error('Could not find the "Daily Tasks" template toggle on your Tasks page.');
  layoutCache = { at: Date.now(), v: { templateToggle, liveToggle } };
  return layoutCache.v;
}

async function dayHeadings(): Promise<any[]> {
  const { liveToggle } = await layout();
  return (await children(liveToggle.id)).filter((b) => isHeading(b));
}

function create(t: NewTask | Item, todo = true): any {
  const content = 'text' in t ? t.text : '';
  return { object: 'block', type: todo ? 'to_do' : 'paragraph', [todo ? 'to_do' : 'paragraph']: { rich_text: [{ type: 'text', text: { content } }], ...(todo ? { checked: false } : {}) } };
}

// Append blocks level by level, so nesting deeper than Notion's two-level limit still works.
async function appendTree(parentId: string, items: (Item | NewTask)[], after?: string): Promise<void> {
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const res = await call('PATCH', `/blocks/${parentId}/children`, { children: chunk.map((x) => create(x)), ...(after && i === 0 ? { after } : {}) });
    for (let k = 0; k < chunk.length; k++) {
      const kids = (chunk[k] as Item).children ?? (chunk[k] as NewTask).children?.map((c) => ({ text: c }));
      if (kids && kids.length) await appendTree(res.results[k].id, kids as (Item | NewTask)[]);
    }
  }
}

async function templateFor(day: string): Promise<Item[]> {
  const { templateToggle } = await layout();
  const heads = (await children(templateToggle.id)).filter((b) => isHeading(b));
  const h = heads.find((b) => norm(text(b)).startsWith(day.toLowerCase()));
  return h ? toItems(await children(h.id)) : [];
}

async function findHeading(date: string): Promise<any | null> {
  const day = weekday(date);
  return (await dayHeadings()).find((b) => norm(text(b)).includes(day.toLowerCase())) ?? null;
}

const remindersDb = () => process.env.NOTION_REMINDERS_DB_ID!;

function toReminder(p: any): Reminder {
  const props = p.properties || {};
  const title = Object.values(props).find((x: any) => x.type === 'title') as any;
  const status = (props[' ']?.status?.name || props['Status']?.status?.name || 'Not started') as Reminder['status'];
  const due = props['Due']?.date;
  return { id: p.id, name: (title?.title || []).map((t: any) => t.plain_text).join(''), status, priority: props['Priority']?.select?.name || 'Medium', due: due ? (due.end || due.start).slice(0, 10) : null };
}

async function notesPages(): Promise<{ id: string; title: string }[]> {
  const kids = await children(process.env.NOTION_NOTES_PAGE_ID!);
  return kids.filter((b) => b.type === 'child_page').map((b) => ({ id: b.id, title: b.child_page.title }));
}

export const notion: Workspace = {
  mode: 'notion',

  async getDay(date) {
    const h = await findHeading(date);
    if (!h) return null;
    const blocks = await children(h.id);
    const tplNames = new Set((await templateFor(weekday(date))).map((x) => norm(x.text)));
    const all = await toItems(blocks);
    const newTasks = all.filter((x) => !tplNames.has(norm(x.text)));
    const templateItems = all.filter((x) => tplNames.has(norm(x.text)));
    return { id: h.id, date, heading: text(h), newTasks, templateItems } as DayBlock;
  },

  async getTemplate(day) { return templateFor(day); },

  async buildDay(date, afterId, tasks) {
    const { liveToggle } = await layout();
    const sample = (await dayHeadings())[0];
    const type = sample?.type || 'heading_2';
    const res = await call('PATCH', `/blocks/${liveToggle.id}/children`, {
      children: [{ object: 'block', type, [type]: { rich_text: [{ type: 'text', text: { content: weekday(date) } }], is_toggleable: true } }],
      ...(afterId ? { after: afterId } : {}),
    });
    const headingId = res.results[0].id;
    await appendTree(headingId, tasks);
    await call('PATCH', `/blocks/${headingId}/children`, { children: [0, 1, 2].map(() => create({ text: '' }, false)) });
    await appendTree(headingId, await templateFor(weekday(date)));
  },

  async addTasks(date, tasks) {
    const h = await findHeading(date);
    if (!h) return notion.buildDay(date, null, tasks);
    const blocks = await children(h.id);
    // New tasks go above the three empty blocks that separate them from the routine.
    const firstEmpty = blocks.findIndex((b) => b.type === 'paragraph' && !text(b));
    const lastNew = firstEmpty > 0 ? blocks[firstEmpty - 1].id : undefined;
    await appendTree(h.id, tasks, lastNew);
  },

  async removeDay(block) { await call('DELETE', `/blocks/${block.id}`); layoutCache = null; },

  async getReminders() {
    const out: Reminder[] = [];
    let cursor: string | undefined;
    do {
      const j = await call('POST', `/databases/${remindersDb()}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      out.push(...j.results.map(toReminder));
      cursor = j.has_more ? j.next_cursor : undefined;
    } while (cursor);
    return out.filter((r) => r.status !== 'Done');
  },
  async markDone(id) { await call('PATCH', `/pages/${id}`, { properties: { ' ': { status: { name: 'Done' } } } }); },
  async setDue(id, due) { await call('PATCH', `/pages/${id}`, { properties: { Due: { date: { start: due } } } }); },
  async createReminder(r) {
    await call('POST', '/pages', { parent: { database_id: remindersDb() }, properties: { Name: { title: [{ text: { content: r.name } }] }, Priority: { select: { name: r.priority } }, Due: { date: { start: r.due } }, ' ': { status: { name: 'Not started' } } } });
  },

  async getNotes() {
    const out: Note[] = [];
    for (const p of await notesPages()) out.push({ title: p.title, text: (await children(p.id)).map(text).filter(Boolean).join('\n') });
    return out;
  },
  async getGroceries() {
    const g = (await notesPages()).find((p) => /grocery/i.test(p.title));
    if (!g) return [];
    const blocks = await children(g.id);
    const stop = blocks.findIndex((b) => isHeading(b) && /subscription/i.test(text(b)));
    return (stop >= 0 ? blocks.slice(0, stop) : blocks).filter((b) => b.type === 'to_do' && !b.to_do.checked).map(text);
  },
  async addGroceries(items) {
    const g = (await notesPages()).find((p) => /grocery/i.test(p.title));
    if (!g) throw new Error('No Grocery List page under Notes.');
    const blocks = await children(g.id);
    const stop = blocks.findIndex((b) => isHeading(b) && /subscription/i.test(text(b)));
    const todos = (stop >= 0 ? blocks.slice(0, stop) : blocks).filter((b) => b.type === 'to_do');
    await appendTree(g.id, items.map((t) => ({ text: t })), todos.length ? todos[todos.length - 1].id : undefined);
  },

  async lastSnapshot() { return sheets.sheetsReady() ? sheets.lastSnapshot() : demo.lastSnapshot(); },
  async appendSnapshot(row) { return sheets.sheetsReady() ? sheets.appendSnapshot(row) : demo.appendSnapshot(row); },
};

export function notionReady(): boolean {
  return !!(process.env.NOTION_TOKEN && process.env.NOTION_TASKS_PAGE_ID && process.env.NOTION_REMINDERS_DB_ID && process.env.NOTION_NOTES_PAGE_ID);
}
export { DAYS };
