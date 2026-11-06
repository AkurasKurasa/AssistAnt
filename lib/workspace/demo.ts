import type { DayBlock, Item, Note, Reminder, SnapshotRow } from '../types';
import type { Change, Doc, NewTask, Workspace } from './types';
import { addDays, shortDate, today, weekday } from '../time';
import { visitorId } from '../visitor';

// Sample workspace for a fictional user, laid out like a Notion Tasks page. Lives in memory while the server runs.
let n = 0;
const id = () => 'demo-' + ++n;
const item = (text: string, checked = false, skipped = false, children?: Item[]): Item => ({ id: id(), text, checked, skipped, children });

const BASE = ['⏰ Morning routine', '🧹 Tidy the desk', '⏰ 20-minute walk', 'Drink 2L of water', 'Afternoon focus block', 'Read 10 pages', 'Language practice', 'Stretch', 'Dishes', 'Plan tomorrow', '⏰ Evening wind-down'];
function template(day: string): Item[] {
  const extra: Record<string, string[]> = {
    Tuesday: ['⏰ Gym (upper body)'], Thursday: ['⏰ Gym (lower body)'],
    Saturday: ['⏰ Long run', 'Meal prep', '🧹 Weekly House Clean'], Sunday: ['Laundry', 'Rest day'],
  };
  const list = [...BASE.slice(0, 3), ...(extra[day] || []), ...BASE.slice(3)];
  if (day !== 'Sunday') list.splice(5, 0, 'Water the plants');
  return list.map((t) => item(t));
}

interface DemoDay { block: DayBlock }

function seed() {
  const t = today();
  const tpl = template(weekday(t)).map((x, i) => ({ ...x, checked: i % 4 !== 3 }));
  const days: Record<string, DemoDay> = {
    [t]: {
      block: {
        id: id(), date: t, heading: weekday(t), templateItems: tpl,
        newTasks: [
          item('🎯 Send the project status update', true),
          item('🎯 Fix the login page bug', false, false, [item('Reproduce on mobile', true), item('Patch the date parser'), item('Deploy')]),
          item('🎯 Buy printer ink', false, true),
        ],
      },
    },
  };
  const reminders: Reminder[] = [
    { id: id(), name: 'Project status update', status: 'In progress', priority: 'High', due: t },
    { id: id(), name: 'Weekly House Clean', status: 'Not started', priority: 'Medium', due: nextSaturday(t) },
    { id: id(), name: 'Pay the electricity bill', status: 'Not started', priority: 'Urgent', due: addDays(t, 3) },
    { id: id(), name: 'Finish the presentation slides', status: 'Not started', priority: 'High', due: addDays(t, 4) },
    { id: id(), name: 'Renew library card', status: 'Not started', priority: 'Low', due: addDays(t, 12) },
  ];
  const notes: Note[] = [
    { title: 'Worries', text: `Pay the course fee before ${shortMonthDay(addDays(t, 7))}.\nThe team wants the presentation slides soon.` },
    { title: 'Chore and Habits List', text: 'Daily: dishes, tidy the desk\nWeekly: Weekly House Clean (Saturdays only)\nEvery 2 weeks: Change bedsheets\nMonthly: Clean the fridge (first Sunday of the month only)' },
    { title: 'Grocery List', text: '' },
  ];
  // A few earlier Daily Snapshot rows, so the sheet has history to compare against.
  const snapshots: SnapshotRow[] = [3, 2, 1].map((n, k) => ({ date: addDays(t, -n), brokerA: [790.1 + k * 11.2, 40, 0], brokerB: [1498.6 + k * 15.8, 120.5, 0], wallet: [92.4 + k * 1.9, 12, 0], rate: 0.92, notes: 'sample' }));
  return { days, reminders, notes, groceries: ['rice', 'eggs', 'chicken breast', 'oats', 'bananas', 'coffee'], snapshots, docs: [] as Doc[], changes: [] as Change[] };
}

function nextSaturday(d: string) { let x = d; do { x = addDays(x, 1); } while (weekday(x) !== 'Saturday'); return x; }
function shortMonthDay(d: string) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }

type DemoCopy = { data: ReturnType<typeof seed>; day: string };
const g = globalThis as unknown as { __demos?: Map<string, DemoCopy> };
// Seed once per day, so removing today's block doesn't wipe the rest.
// One copy per visitor, so public demo visitors don't see each other's changes (locally there's one).
function db() {
  const all = (g.__demos ??= new Map<string, DemoCopy>());
  let e = all.get(visitorId());
  if (!e || e.day !== today()) { e = { data: seed(), day: today() }; all.set(visitorId(), e); }
  return e.data;
}

function log(app: Change['app'], what: string, ref: string) {
  const c = db().changes;
  c.push({ id: id(), at: Date.now(), app, what, ref });
  if (c.length > 60) c.shift();
}

// Everything the Live view shows of the fake apps, plus what the crew changed.
export function demoView() {
  const d = db();
  return {
    today: today(),
    days: Object.values(d.days).map((x) => x.block).sort((a, b) => a.date.localeCompare(b.date)),
    reminders: d.reminders, notes: d.notes, groceries: d.groceries, snapshots: d.snapshots, docs: d.docs, changes: d.changes,
  };
}

export const demo: Workspace = {
  mode: 'demo',
  async getDay(date) { return db().days[date]?.block ?? null; },
  async getTemplate(day) { return template(day); },
  async buildDay(date, _after, tasks) {
    const block = { id: id(), date, heading: weekday(date), templateItems: template(weekday(date)), newTasks: tasks.map((t) => item(t.text, false, false, t.children?.map((c) => item(c)))) };
    db().days[date] = { block };
    log('notion', `Built the ${weekday(date)} page with ${tasks.length} new task${tasks.length === 1 ? '' : 's'}`, block.id);
  },
  async addTasks(date, tasks) {
    const d = db().days[date];
    if (!d) return demo.buildDay(date, null, tasks);
    const added = tasks.map((t) => item(t.text, false, false, t.children?.map((c) => item(c))));
    d.block.newTasks.push(...added);
    added.forEach((a) => log('notion', `Added “${a.text.replace(/^🎯\s*/, '')}” to ${weekday(date)}`, a.id));
  },
  async removeDay(block) { delete db().days[block.date]; log('notion', `Removed the ${weekday(block.date)} page`, block.id); },
  async getReminders() { return db().reminders.filter((r) => r.status !== 'Done'); },
  async markDone(rid) { const r = db().reminders.find((x) => x.id === rid); if (r) { r.status = 'Done'; log('notion', `Marked “${r.name}” done`, r.id); } },
  async setDue(rid, due) { const r = db().reminders.find((x) => x.id === rid); if (r) { r.due = due; log('notion', `Moved “${r.name}” to ${shortDate(due)}`, r.id); } },
  async createReminder(r) { const rid = id(); db().reminders.push({ id: rid, name: r.name, due: r.due, priority: r.priority, status: 'Not started' }); log('notion', `New reminder “${r.name}”, due ${shortDate(r.due)}`, rid); },
  async getNotes() { return db().notes; },
  async getGroceries() { return db().groceries; },
  async addGroceries(items) { db().groceries.push(...items); items.forEach((i) => log('notion', `Added ${i} to the Grocery List`, 'g:' + i.toLowerCase())); },
  async lastSnapshot() { const s = db().snapshots; return s[s.length - 1] ?? { date: addDays(today(), -1), brokerA: [812.4, 40, 0], brokerB: [1530.2, 120.5, 0], wallet: [96.1, 12, 0], rate: 0.92, notes: 'sample' }; },
  async appendSnapshot(row) { db().snapshots.push(row); log('sheets', `New Daily Snapshot row for ${shortDate(row.date)}`, 's:' + row.date); },
  async writeDoc(title, body) {
    const docs = db().docs, now = new Date().toISOString();
    const doc = docs.find((d) => d.title === title); // writing the same title again updates it
    if (doc) Object.assign(doc, { body, updatedAt: now }); else docs.push({ id: id(), title, body, updatedAt: now });
    log('docs', `${doc ? 'Updated' : 'Wrote'} “${title}”`, (doc || docs[docs.length - 1]).id);
  },
};
