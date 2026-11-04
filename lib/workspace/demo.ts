import type { DayBlock, Item, Note, Reminder, SnapshotRow } from '../types';
import type { NewTask, Workspace } from './types';
import { addDays, today, weekday } from '../time';
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
  return { days, reminders, notes, groceries: ['rice', 'eggs', 'chicken breast', 'oats', 'bananas', 'coffee'], snapshots: [] as SnapshotRow[] };
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

export const demo: Workspace = {
  mode: 'demo',
  async getDay(date) { return db().days[date]?.block ?? null; },
  async getTemplate(day) { return template(day); },
  async buildDay(date, _after, tasks) {
    db().days[date] = { block: { id: id(), date, heading: weekday(date), templateItems: template(weekday(date)), newTasks: tasks.map((t) => item(t.text, false, false, t.children?.map((c) => item(c)))) } };
  },
  async addTasks(date, tasks) {
    const d = db().days[date];
    if (!d) return demo.buildDay(date, null, tasks);
    d.block.newTasks.push(...tasks.map((t) => item(t.text, false, false, t.children?.map((c) => item(c)))));
  },
  async removeDay(block) { delete db().days[block.date]; },
  async getReminders() { return db().reminders.filter((r) => r.status !== 'Done'); },
  async markDone(rid) { const r = db().reminders.find((x) => x.id === rid); if (r) r.status = 'Done'; },
  async setDue(rid, due) { const r = db().reminders.find((x) => x.id === rid); if (r) r.due = due; },
  async createReminder(r) { db().reminders.push({ id: id(), name: r.name, due: r.due, priority: r.priority, status: 'Not started' }); },
  async getNotes() { return db().notes; },
  async getGroceries() { return db().groceries; },
  async addGroceries(items) { db().groceries.push(...items); },
  async lastSnapshot() { const s = db().snapshots; return s[s.length - 1] ?? { date: addDays(today(), -1), brokerA: [812.4, 40, 0], brokerB: [1530.2, 120.5, 0], wallet: [96.1, 12, 0], rate: 0.92, notes: 'sample' }; },
  async appendSnapshot(row) { db().snapshots.push(row); },
};
