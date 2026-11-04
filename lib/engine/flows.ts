import type { AgentId, DayBlock, Item, Reminder, Tier } from '../types';
import type { NewTask, Workspace } from '../workspace/types';
import type { Run } from './run';
import { ask, parseJSON } from '../llm/router';
import { addDays, daysBetween, dueLabel, shortDate, weekday } from '../time';
import { saveRoutine } from './routines';

export interface Ctx { run: Run; ws: Workspace; today: string; task: string; routineBody?: string }
export interface Flow { title: string; lineup: AgentId[][]; run: (c: Ctx) => Promise<void> }

// ---------- helpers ----------
const STOP = new Set(['the', 'a', 'an', 'to', 'and', 'of', 'my', 'for', 'on', 'in', 'up', 'do']);
const words = (s: string) => s.toLowerCase().replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, '').replace(/\(due[^)]*\)/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
function similarity(a: string, b: string): number {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let hit = 0; A.forEach((w) => { if (B.has(w)) hit++; });
  return hit / Math.min(A.size, B.size);
}
const clean = (s: string) => s.replace(/^[\u{1F300}-\u{1FAFF}☀-➿️\s]+/u, '').replace(/\s*\(due[^)]*\)\s*$/, '').trim();
const isDone = (i: Item) => i.checked || (!!i.children?.length && i.children.every((c) => c.checked));
const short = (s: string, n = 220) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
function nextWeekday(from: string, day: string) { let d = addDays(from, 1); while (weekday(d) !== day) d = addDays(d, 1); return d; }

async function think(c: Ctx, agent: AgentId, tier: Exclude<Tier, 'code'>, prompt: string, system: string, fallback: () => string): Promise<{ text: string; model: string; ai: boolean }> {
  c.run.work(agent, 'Thinking…', 'routing');
  const r = await ask(tier, prompt, system, (m) => c.run.sys('Router: ' + m));
  if (r) return { text: r.text, model: r.model, ai: true };
  return { text: fallback(), model: 'plain rules', ai: false };
}

// ---------- finish-day ----------
export const finishDay: Flow = {
  title: 'Finish day',
  lineup: [['reader'], ['summarizer', 'matcher', 'scout', 'chores'], ['planner'], ['writer'], ['checker']],
  async run(c) {
    const { run, ws, today } = c;
    const tomorrow = addDays(today, 1);
    run.orch('Running finish-day. Reader goes first.');
    run.msg('orch', 'reader', 'Get today, Reminders, Notes', 'Pull today’s block, the open Reminders and the Notes pages.');
    const day = await ws.getDay(today);
    if (!day) {
      run.work('reader', `There is no ${weekday(today)} block on the Tasks page.`);
      run.msg('reader', 'orch', `No ${weekday(today)} block`, `I couldn’t find today’s heading in the synced block.`, 'alert');
      run.emit({ t: 'result', say: `I couldn’t find a ${weekday(today)} block on your Tasks page, so I stopped before changing anything.` });
      return;
    }
    const [reminders, notes] = await Promise.all([ws.getReminders(), ws.getNotes()]);
    const all = [...day.newTasks, ...day.templateItems];
    run.work('reader', `Today has ${all.length} items. ${reminders.length} open Reminders. ${notes.length} Notes pages.`);

    const done = all.filter((i) => isDone(i) && !i.skipped);
    const open = day.newTasks.filter((i) => !isDone(i) && !i.skipped);
    const skipped = all.filter((i) => i.skipped);
    run.msg('reader', 'summarizer', `Today: ${done.length} done`, `${done.length} done, ${open.length} new tasks still open, ${skipped.length} skipped.`);
    run.msg('reader', 'matcher', `${done.length} done + ${reminders.length} reminders`, 'Finished items and every open Reminder, so you can match them.');
    run.msg('reader', 'scout', `${notes.length} Notes pages`, notes.map((n) => n.title).join(', ') || 'No notes found.');
    run.msg('reader', 'chores', 'Chore and Habits List', 'The cadence list and the open chore Reminders.');

    const [summary, matched, found, chores] = await Promise.all([
      summarize(c, day, done, open, skipped),
      matchReminders(c, done, reminders),
      scoutNotes(c, notes, reminders),
      rollChores(c, notes, reminders),
    ]);

    // Planner: deadlines within 3 days of tomorrow, plus leftovers, listed once.
    const doneIds = new Set(matched.map((m) => m.id));
    const windowEnd = addDays(tomorrow, 3);
    const deadlines = reminders.filter((r) => !doneIds.has(r.id) && r.due && r.due <= windowEnd);
    const tasks: NewTask[] = [];
    for (const r of deadlines) tasks.push({ text: `🎯 ${r.name} (${r.due! < tomorrow ? 'overdue' : dueLabel(r.due!, tomorrow)})` });
    const carried: string[] = [];
    for (const l of open) {
      const name = clean(l.text);
      carried.push(name);
      if (deadlines.some((r) => similarity(r.name, name) >= 0.6)) continue;
      tasks.push({ text: '🎯 ' + name, children: l.children?.filter((x) => !x.checked).map((x) => x.text) });
    }
    run.work('planner', `${weekday(tomorrow)}: ${deadlines.length} deadline${deadlines.length === 1 ? '' : 's'}, ${carried.length} carried over, then a fresh copy of the ${weekday(tomorrow)} routine.`);
    run.msg('planner', 'writer', `${weekday(tomorrow)} plan + ${tasks.length} tasks`, `Build ${weekday(tomorrow)} with: ${tasks.map((t) => clean(t.text)).join('; ') || 'just the routine'}.`);

    // Writer: safe changes now.
    let safe = 0;
    for (const m of matched) {
      await ws.markDone(m.id); safe++;
      if (/weekly house clean/i.test(m.name)) { await ws.createReminder({ name: 'Weekly House Clean', due: nextWeekday(today, 'Saturday'), priority: 'Medium' }); safe++; }
    }
    for (const name of carried) {
      const r = reminders.find((x) => similarity(x.name, name) >= 0.6);
      if (r) { if (!r.due || r.due <= tomorrow) { await ws.setDue(r.id, tomorrow); safe++; } }
      else { await ws.createReminder({ name, due: tomorrow, priority: 'Medium' }); safe++; }
    }
    for (const ch of chores) { await ws.createReminder(ch); safe++; }
    const existing = await ws.getDay(tomorrow);
    if (existing) {
      const have = new Set(existing.newTasks.map((t) => clean(t.text).toLowerCase()));
      const missing = tasks.filter((t) => !have.has(clean(t.text).toLowerCase()));
      if (missing.length) await ws.addTasks(tomorrow, missing);
    } else {
      await ws.buildDay(tomorrow, day.id, tasks);
    }
    safe++;
    run.work('writer', `Made ${safe} safe changes. Holding ${found.length + 1} for your OK.`, 'notion api');

    const items = [
      ...found.map((f) => ({ title: `Add a Reminder: ${f.name}`, why: `Spotted by Notes Scout. Due ${shortDate(f.due)}. ${f.priority}.` })),
      { title: `Remove ${weekday(today)}’s block from Tasks`, why: `${weekday(tomorrow)} is built.` },
    ];
    run.msg('writer', 'orch', `${items.length} need approval`, items.map((i) => i.title).join('; '), 'alert');
    run.orch('Holding the risky changes until you say OK.');
    run.state('writer', 'waiting');
    const answers = await run.approve(items);
    run.state('writer', 'ready');
    run.msg('orch', 'writer', 'Go ahead', 'You answered. Go ahead with what you approved.', 'reply');

    const extra: NewTask[] = [];
    for (let i = 0; i < found.length; i++) if (answers[i]) {
      await ws.createReminder(found[i]);
      if (found[i].due <= windowEnd) extra.push({ text: `🎯 ${found[i].name} (${dueLabel(found[i].due, tomorrow)})` });
    }
    if (extra.length) await ws.addTasks(tomorrow, extra);
    const removeToday = answers[answers.length - 1];
    if (removeToday) await ws.removeDay(day);
    run.work('writer', `Wrote ${answers.filter(Boolean).length} approved change${answers.filter(Boolean).length === 1 ? '' : 's'}.`, 'notion api');
    run.msg('writer', 'checker', 'Check my writes', `Please check ${weekday(tomorrow)}${removeToday ? ' and that today is gone' : ''}.`);

    // Checker: re-read and send back anything wrong, once.
    let built = await ws.getDay(tomorrow);
    if (!built) {
      run.work('checker', `${weekday(tomorrow)} isn’t there. Sending it back.`);
      run.msg('checker', 'writer', `${weekday(tomorrow)} is missing`, `I can’t find ${weekday(tomorrow)}. Please build it again.`, 'alert');
      await ws.buildDay(tomorrow, null, [...tasks, ...extra]);
      run.work('writer', `Rebuilt ${weekday(tomorrow)}.`, 'notion api');
      run.msg('writer', 'checker', 'Fixed, check again', 'Rebuilt it. Can you look again?', 'reply');
      built = await ws.getDay(tomorrow);
    }
    const stillToday = removeToday ? await ws.getDay(today) : null;
    const ok = !!built && !stillToday;
    run.work('checker', ok ? `${weekday(tomorrow)} has ${built!.newTasks.length} new tasks and its routine. ${removeToday ? 'Today is gone.' : 'Today was kept.'}` : 'Something is still off. Flagging it.');
    run.msg('checker', 'orch', ok ? 'All good' : 'Needs a look', ok ? 'Everything checks out.' : 'Please check the Tasks page by hand.', ok ? 'reply' : 'alert');
    run.orch('Finished. Ready for the next thing.');

    run.emit({
      t: 'result', say: summary,
      rows: (built?.newTasks || []).map((t) => [clean(t.text), (t.text.match(/\(([^)]+)\)\s*$/)?.[1] || 'carried over').replace(/^due /, 'due ')] as [string, string]),
      note: 'Say “log my portfolio” to add today’s figures.',
    });
  },
};

async function summarize(c: Ctx, day: DayBlock, done: Item[], open: Item[], skipped: Item[]): Promise<string> {
  const fallback = () => {
    const doneNew = day.newTasks.filter((i) => isDone(i) && !i.skipped).map((i) => clean(i.text));
    let s = doneNew.length ? `Good work today. You finished ${doneNew.slice(0, 3).join(', ')}.` : `You got through ${done.length} things today.`;
    if (open.length) s += ` ${open.map((i) => clean(i.text)).slice(0, 2).join(' and ')} ${open.length > 1 ? 'move' : 'moves'} to tomorrow.`;
    if (skipped.length) s += ` ${clean(skipped[0].text)} was skipped on purpose.`;
    return s;
  };
  const r = await think(c, 'summarizer', 'smart',
    `Today’s new tasks done: ${day.newTasks.filter(isDone).map((i) => clean(i.text)).join('; ') || 'none'}.\nStill open: ${open.map((i) => clean(i.text)).join('; ') || 'none'}.\nSkipped on purpose: ${skipped.map((i) => clean(i.text)).join('; ') || 'none'}.\nRoutine items done: ${day.templateItems.filter(isDone).length} of ${day.templateItems.length}.`,
    'Write a 2 to 3 sentence end-of-day summary for the user in warm, plain prose. Say what got done and what is still open. Treat skipped items as intentional. Acknowledge effort without keeping score. No lists, no emoji.',
    fallback);
  c.run.work('summarizer', short(r.text), r.model);
  c.run.msg('summarizer', 'orch', 'Summary ready', 'Your summary is ready.', 'reply');
  return r.text;
}

async function matchReminders(c: Ctx, done: Item[], reminders: Reminder[]): Promise<Reminder[]> {
  const { run, today } = c;
  run.work('matcher', 'Comparing finished items with open Reminders…');
  const out: Reminder[] = [];
  for (const r of reminders) {
    let best = 0, item: Item | null = null;
    for (const i of done) { const s = similarity(i.text, r.name); if (s > best) { best = s; item = i; } }
    if (best >= 0.6) { out.push(r); continue; }
    if (best >= 0.34 && item) {
      run.msg('matcher', 'reader', `Is "${clean(item.text)}" the same as "${r.name}"?`, `Can you check the Reminder "${r.name}" for me?`);
      const close = !!r.due && Math.abs(daysBetween(today, r.due)) <= 1;
      run.work('reader', `"${r.name}" is due ${r.due ? shortDate(r.due) : 'with no date'}.`);
      run.msg('reader', 'matcher', r.due ? `Due ${shortDate(r.due)}` : 'No due date', `"${r.name}" is ${r.priority} and due ${r.due ? shortDate(r.due) : 'whenever'}.`, 'reply');
      if (close) out.push(r);
    }
  }
  run.work('matcher', out.length ? `Matched ${out.length}: ${out.map((r) => r.name).join(', ')}.` : 'No Reminders to close today.');
  run.msg('matcher', 'planner', `${out.length} to mark Done`, out.length ? `Mark Done: ${out.map((r) => r.name).join('; ')}.` : 'Nothing to mark Done.');
  return out;
}

interface Found { name: string; due: string; priority: string }
async function scoutNotes(c: Ctx, notes: { title: string; text: string }[], reminders: Reminder[]): Promise<Found[]> {
  const text = notes.filter((n) => !/grocery|chore/i.test(n.title)).map((n) => `## ${n.title}\n${n.text}`).join('\n\n');
  const fallback = () => {
    const out: Found[] = [];
    const re = /([^.\n]*?)\b(?:before|by|due)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const month = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[2].slice(0, 3)) / 3 + 1;
      let year = Number(c.today.slice(0, 4));
      const due = `${year}-${String(month).padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      const name = m[1].replace(/^[\s\-*]+/, '').trim() || 'Deadline from your notes';
      out.push({ name: name.charAt(0).toUpperCase() + name.slice(1), due: due < c.today ? `${year + 1}${due.slice(4)}` : due, priority: 'High' });
    }
    return JSON.stringify(out);
  };
  const r = await think(c, 'scout', 'best',
    `Today is ${c.today}.\nExisting Reminders: ${reminders.map((x) => x.name).join('; ')}\n\nNotes:\n${text}`,
    'Find real deadlines or obligations in the notes that are NOT already in the existing Reminders. Reply with only JSON: [{"name": string, "due": "YYYY-MM-DD", "priority": "Urgent|High|Medium|Low"}]. Return [] if none. Do not invent dates.',
    fallback);
  const found = parseJSON<Found[]>(r.text, []).filter((f) => f && f.name && /^\d{4}-\d{2}-\d{2}$/.test(f.due) && !reminders.some((x) => similarity(x.name, f.name) >= 0.6));
  c.run.work('scout', found.length ? `Found ${found.length} deadline${found.length > 1 ? 's' : ''} with no Reminder: ${found.map((f) => `${f.name} (${shortDate(f.due)})`).join(', ')}.` : 'No hidden deadlines in your notes.', r.model);
  c.run.msg('scout', 'planner', found.length ? `${found.length} new deadline${found.length > 1 ? 's' : ''}` : 'Nothing new', found.length ? `These are guesses, so they need your OK: ${found.map((f) => f.name).join('; ')}.` : 'Notes are clear.', found.length ? 'alert' : undefined);
  return found;
}

async function rollChores(c: Ctx, notes: { title: string; text: string }[], reminders: Reminder[]): Promise<Found[]> {
  const list = notes.find((n) => /chore/i.test(n.title))?.text || '';
  const out: Found[] = [];
  for (const line of list.split('\n')) {
    const m = line.match(/^\s*([^:]+):\s*(.+)$/);
    if (!m || /^daily/i.test(m[1])) continue;
    const cadence = m[1].toLowerCase();
    for (const raw of m[2].split(',')) {
      const name = raw.replace(/\(.*?\)/g, '').trim();
      if (!name || reminders.some((r) => similarity(r.name, name) >= 0.6)) continue;
      const note = raw.match(/\((.*?)\)/)?.[1] || '';
      let due = addDays(c.today, 7);
      if (/saturday/i.test(note) || /weekly/.test(cadence)) due = nextWeekday(c.today, 'Saturday');
      else if (/2 weeks/.test(cadence)) due = /sunday/i.test(note) ? nextWeekday(addDays(c.today, 7), 'Sunday') : addDays(c.today, 14);
      else if (/month/.test(cadence)) { const d = new Date(c.today + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1, 1); due = d.toISOString().slice(0, 10); if (/first sunday/i.test(note)) { while (weekday(due) !== 'Sunday') due = addDays(due, 1); } }
      out.push({ name, due, priority: 'Medium' });
    }
  }
  c.run.work('chores', out.length ? `${out.map((o) => `${o.name}: next due ${shortDate(o.due)}`).join('. ')}.` : 'Every chore already has an open Reminder.');
  c.run.msg('chores', 'planner', out.length ? `${out.length} chore Reminder${out.length > 1 ? 's' : ''}` : 'Chores are on track', out.length ? `Add: ${out.map((o) => o.name).join('; ')}.` : 'Nothing to add.');
  return out;
}

// ---------- morning brief ----------
export const morningBrief: Flow = {
  title: 'Morning brief',
  lineup: [['reader'], ['scout', 'briefer']],
  async run(c) {
    const { run, ws, today } = c;
    run.orch('Putting together the morning brief.');
    run.msg('orch', 'reader', 'Get today + due soon', 'Pull today’s block and Reminders due in the next 3 days.');
    const [day, rem, notes] = await Promise.all([ws.getDay(today), ws.getReminders(), ws.getNotes()]);
    const soon = rem.filter((r) => r.due && r.due <= addDays(today, 3)).sort((a, b) => a.due!.localeCompare(b.due!));
    run.work('reader', `Today: ${day?.newTasks.length ?? 0} new tasks plus the routine. ${soon.length} Reminders due within 3 days.`);
    run.msg('reader', 'scout', 'Notes pages', 'Here are the Notes pages.');
    run.msg('reader', 'briefer', `Today + ${soon.length} deadlines`, 'Here is today and what’s due soon.');
    const worries = notes.find((n) => /worr/i.test(n.title))?.text || '';
    run.work('scout', worries ? short('Worries this week: ' + worries.split('\n').filter(Boolean).slice(0, 2).join(' ')) : 'No worries written down.');
    run.msg('scout', 'briefer', 'Worries', worries ? short(worries, 160) : 'Nothing in the Worries note.');
    const r = await think(c, 'briefer', 'smart',
      `Today (${weekday(today)}): ${day?.newTasks.map((t) => clean(t.text)).join('; ') || 'no new tasks'}.\nDue soon: ${soon.map((s) => `${s.name} (${s.priority}, ${shortDate(s.due!)})`).join('; ') || 'nothing'}.\nWorries: ${worries || 'none'}`,
      'Write a short morning brief for the user: 2 to 3 sentences on what matters most today. Plain, calm, no lists, no emoji.',
      () => `${soon.length ? `Due soon: ${soon.slice(0, 3).map((s) => s.name).join(', ')}.` : 'Nothing urgent is due.'} ${day?.newTasks.length ? `You have ${day.newTasks.length} new tasks today.` : ''}`.trim());
    run.work('briefer', short(r.text), r.model);
    run.msg('briefer', 'orch', 'Brief ready', 'Morning brief is ready.', 'reply');
    run.orch('Finished.');
    run.emit({ t: 'result', say: r.text, rows: soon.map((s) => [s.name, `${s.priority}, ${shortDate(s.due!)}`]) });
  },
};

// ---------- groceries ----------
export const groceries: Flow = {
  title: 'Groceries',
  lineup: [['reader'], ['grocer'], ['writer'], ['checker']],
  async run(c) {
    const { run, ws } = c;
    run.orch('Updating the Grocery List.');
    run.msg('orch', 'reader', 'Get the Grocery List', 'Pull the Grocery List.');
    const list = await ws.getGroceries();
    run.work('reader', `Grocery List has ${list.length} things to buy.`);
    run.msg('reader', 'grocer', `${list.length} items`, list.join(', ') || 'The list is empty.');
    const r = await think(c, 'grocer', 'fast',
      `Request: "${c.task}"\nCurrent list: ${list.join(', ')}`,
      'Extract the grocery items the user wants to add. Skip anything already on the list, including obvious synonyms (cilantro = coriander, scallions = green onions). Reply with only JSON: {"add": [string], "skipped": [{"item": string, "because": string}]}',
      () => {
        const raw = c.task.toLowerCase().replace(/please|can you|add|put|buy|get|need|to (my |the )?(grocery list|groceries|grocery|shopping list|list)|groceries|grocery|some/g, ' ');
        const items = raw.split(/,| and |\+/).map((s) => s.trim()).filter(Boolean);
        const SAME: Record<string, string> = { cilantro: 'coriander', scallions: 'green onions', 'spring onions': 'green onions', garbanzos: 'chickpeas', aubergine: 'eggplant', courgette: 'zucchini' };
        const canon = (x: string) => { const w = x.toLowerCase().trim(); return (SAME[w] || w).replace(/s$/, ''); };
        const have = new Map(list.map((x) => [canon(x), x] as [string, string]));
        return JSON.stringify({ add: items.filter((i) => !have.has(canon(i))), skipped: items.filter((i) => have.has(canon(i))).map((i) => ({ item: i, because: `already there as \u201c${have.get(canon(i))}\u201d` })) });
      });
    const plan = parseJSON<{ add: string[]; skipped: { item: string; because: string }[] }>(r.text, { add: [], skipped: [] });
    plan.add = (plan.add || []).filter(Boolean); plan.skipped = plan.skipped || [];
    run.work('grocer', `Adding ${plan.add.join(', ') || 'nothing'}${plan.skipped.length ? `. Skipping ${plan.skipped.map((s) => s.item).join(', ')}` : ''}.`, r.model);
    if (!plan.add.length) {
      run.msg('grocer', 'orch', 'Nothing new to add', 'Everything is already on the list.', 'reply');
      run.emit({ t: 'result', say: 'Everything you asked for is already on your Grocery List.' });
      return;
    }
    run.msg('grocer', 'writer', `Add ${plan.add.join(', ')}`, `Add these to the Grocery List: ${plan.add.join(', ')}.`);
    await ws.addGroceries(plan.add);
    run.work('writer', `Added ${plan.add.length} item${plan.add.length > 1 ? 's' : ''} to the Grocery List.`, 'notion api');
    run.msg('writer', 'checker', 'Check the list', 'Check the Grocery List please.');
    const after = await ws.getGroceries();
    const ok = plan.add.every((a) => after.some((x) => x.toLowerCase() === a.toLowerCase()));
    run.work('checker', ok ? `Grocery List has ${after.length} items now.` : 'Some items didn’t land.');
    run.msg('checker', 'orch', ok ? 'All good' : 'Needs a look', ok ? 'Looks right.' : 'Please check the list.', ok ? 'reply' : 'alert');
    run.orch('Finished.');
    run.emit({ t: 'result', say: `Added ${plan.add.join(', ')} to your Grocery List.${plan.skipped.length ? ` Skipped ${plan.skipped.map((s) => `${s.item} (${s.because})`).join(', ')}.` : ''}` });
  },
};

// ---------- add a task ----------
export const addTask: Flow = {
  title: 'Add a task',
  lineup: [['reader'], ['planner'], ['writer'], ['checker']],
  async run(c) {
    const { run, ws, today } = c;
    const m = c.task.match(/^(?:please\s+)?(?:add|put|remind me to|schedule)\s+(.+?)\s+(?:to|on|for)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const what = m ? m[1] : c.task.replace(/^(add|put)\s+/i, '');
    const word = (m ? m[2] : 'tomorrow').toLowerCase();
    const date = word === 'today' ? today : word === 'tomorrow' ? addDays(today, 1) : nextWeekday(addDays(today, -1), word.charAt(0).toUpperCase() + word.slice(1));
    run.orch(`Adding a task to ${weekday(date)}.`);
    run.msg('orch', 'reader', `Find ${weekday(date)}`, `Find ${weekday(date)} on the Tasks page.`);
    const day = await ws.getDay(date);
    run.work('reader', day ? `Found ${weekday(date)}. It has ${day.newTasks.length} new tasks above the routine.` : `${weekday(date)} isn’t built yet.`);
    run.msg('reader', 'planner', `${weekday(date)} block`, day ? `Here is ${weekday(date)}.` : `No block yet for ${weekday(date)}.`);
    run.work('planner', day ? `"${what}" goes with the new tasks, above the routine.` : `I’ll start ${weekday(date)} with "${what}" and its routine.`);
    run.msg('planner', 'writer', `Add "${what}"`, `Add "${what}" to ${weekday(date)}.`);
    await ws.addTasks(date, [{ text: '🎯 ' + what }]);
    run.work('writer', `Added "${what}".`, 'notion api');
    run.msg('writer', 'checker', `Check ${weekday(date)}`, `Added it. Check ${weekday(date)} please.`);
    const after = await ws.getDay(date);
    const ok = !!after?.newTasks.some((t) => similarity(t.text, what) >= 0.6);
    run.work('checker', ok ? `${weekday(date)} has ${after!.newTasks.length} new tasks now. The routine is untouched.` : 'I can’t see it yet.');
    run.msg('checker', 'orch', ok ? 'All good' : 'Needs a look', ok ? 'Looks right.' : 'Please check by hand.', ok ? 'reply' : 'alert');
    run.orch('Finished.');
    run.emit({ t: 'result', say: `Added “${what}” to ${weekday(date)}.` });
  },
};

// ---------- what's due ----------
export const whatsDue: Flow = {
  title: 'What’s due',
  lineup: [['reader'], ['matcher']],
  async run(c) {
    const { run, ws, today } = c;
    run.orch('Checking what’s due.');
    run.msg('orch', 'reader', 'Get open Reminders', 'Pull every open Reminder.');
    const rem = await ws.getReminders();
    const week = rem.filter((r) => r.due && r.due <= addDays(today, 7));
    run.work('reader', `${rem.length} open Reminders. ${week.length} due in the next 7 days.`);
    run.msg('reader', 'matcher', `${week.length} due this week`, 'Here are the ones due this week.');
    const order: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
    week.sort((a, b) => a.due!.localeCompare(b.due!) || (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
    run.work('matcher', week.length ? `Sorted by date, then priority. ${week.filter((w) => w.priority === 'Urgent').length} urgent.` : 'Nothing due this week.');
    run.msg('matcher', 'orch', 'Sorted list', 'Here is the sorted list.', 'reply');
    run.orch('Finished.');
    run.emit({ t: 'result', say: week.length ? `${week.length} thing${week.length > 1 ? 's' : ''} due in the next 7 days.` : 'Nothing is due in the next 7 days.', rows: week.map((w) => [w.name, `${w.priority}, ${w.due! < today ? 'overdue' : shortDate(w.due!)}`]) });
  },
};

// ---------- portfolio ----------
export const portfolio: Flow = {
  title: 'Portfolio',
  lineup: [['reader'], ['clerk'], ['writer'], ['checker']],
  async run(c) {
    const { run, ws, today } = c;
    run.orch('Logging today’s portfolio.');
    run.msg('orch', 'reader', 'Get last snapshot', 'Pull the last row of Daily Snapshot.');
    const last = await ws.lastSnapshot();
    run.work('reader', last ? `Last row is ${last.date}.` : 'Daily Snapshot is empty.');
    run.msg('reader', 'clerk', 'Last row', last ? `Last logged ${last.date}.` : 'No previous row.');
    run.work('clerk', 'Waiting for today’s figures from you.');
    // The wallet is held in a local currency (WALLET_CURRENCY, default EUR) and converted to USD.
    const cur = (process.env.WALLET_CURRENCY || 'EUR').toUpperCase();
    const f = await run.form(`Today’s figures (USD, wallet in ${cur})`, [
      { key: 'brokerA', label: 'Broker 1: invested, cash, net deposit', placeholder: '820, 40, 0' },
      { key: 'brokerB', label: 'Broker 2: invested, cash, net deposit', placeholder: '1540, 120, 0' },
      { key: 'wallet', label: `Crypto wallet in ${cur}: invested, cash, net deposit`, placeholder: '90, 11, 0' },
    ]);
    const nums = (s: string) => { const a = (s || '').split(/[,\s]+/).map(Number).filter((x) => !isNaN(x)); return [a[0] || 0, a[1] || 0, a[2] || 0] as [number, number, number]; };
    run.msg('clerk', 'reader', `Need USD/${cur} close`, `Can you look up today’s USD/${cur} rate?`);
    let rate = 0, source = '';
    try { const j = await (await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) })).json(); rate = j.rates?.[cur] || 0; source = 'open.er-api.com'; } catch { /* offline */ }
    if (!rate && last) { rate = last.rate; source = 'last logged rate'; }
    run.work('reader', rate ? `USD/${cur} is ${rate.toFixed(2)} (${source}).` : 'Couldn’t get a rate.');
    run.msg('reader', 'clerk', rate ? `Rate ${rate.toFixed(2)}` : 'No rate', rate ? `Rate from ${source}.` : 'No rate today.', 'reply');
    const local = nums(f.wallet);
    const wallet = local.map((x) => (rate ? Math.round((x / rate) * 100) / 100 : 0)) as [number, number, number];
    const row = { date: today, brokerA: nums(f.brokerA), brokerB: nums(f.brokerB), wallet, rate, notes: rate ? `Wallet converted at ${rate.toFixed(2)} ${cur}/USD (${source})` : 'No FX rate' };
    const total = row.brokerA[0] + row.brokerA[1] + row.brokerB[0] + row.brokerB[1] + wallet[0] + wallet[1];
    run.work('clerk', `Row ready. Total $${total.toFixed(2)}.`);
    run.msg('clerk', 'writer', 'Add today’s row', 'Write this row to Daily Snapshot.');
    await ws.appendSnapshot(row);
    run.work('writer', 'Wrote columns A to M with the total formula.', 'sheets api');
    run.msg('writer', 'checker', 'Check the row', 'Check the new row please.');
    const back = await ws.lastSnapshot();
    const prev = last ? last.brokerA[0] + last.brokerA[1] + last.brokerB[0] + last.brokerB[1] + last.wallet[0] + last.wallet[1] : 0;
    const ok = back?.date === today;
    run.work('checker', ok ? `Row is there. ${prev ? `Change from ${last!.date}: ${total - prev >= 0 ? '+' : ''}$${(total - prev).toFixed(2)}.` : ''}` : 'I can’t read the row back.');
    run.msg('checker', 'orch', ok ? 'All good' : 'Needs a look', ok ? 'Looks right.' : 'Please check the sheet.', ok ? 'reply' : 'alert');
    run.orch('Finished.');
    run.emit({ t: 'result', say: `Logged today at $${total.toFixed(2)}${prev ? `, ${total - prev >= 0 ? 'up' : 'down'} $${Math.abs(total - prev).toFixed(2)} from ${last!.date}` : ''}.` });
  },
};

// ---------- saved routines (generic) and brand-new requests ----------
export const generic: Flow = {
  title: 'Routine',
  lineup: [['reader'], ['summarizer']],
  async run(c) {
    const { run, ws, today } = c;
    run.orch('Running a saved routine.');
    run.msg('orch', 'reader', 'Get context', 'Pull today and open Reminders.');
    const [day, rem] = await Promise.all([ws.getDay(today), ws.getReminders()]);
    run.work('reader', `Today has ${day?.newTasks.length ?? 0} new tasks. ${rem.length} open Reminders.`);
    run.msg('reader', 'summarizer', 'Context', 'Here is today and the Reminders.');
    const r = await think(c, 'summarizer', 'smart',
      `Routine:\n${c.routineBody}\n\nRequest: ${c.task}\nToday (${today}): ${day?.newTasks.map((t) => clean(t.text)).join('; ') || 'nothing'}\nOpen Reminders: ${rem.map((x) => `${x.name}${x.due ? ' (' + x.due + ')' : ''}`).join('; ')}`,
      'Follow the routine and answer the user in a few plain sentences. You can only read; do not claim to have changed anything.',
      () => 'I need an AI model for this routine, and none are available right now. Check the Sources tab.');
    run.work('summarizer', short(r.text), r.model);
    run.msg('summarizer', 'orch', 'Done', 'Here is the answer.', 'reply');
    run.orch('Finished.');
    run.emit({ t: 'result', say: r.text });
  },
};

export const unplanned: Flow = {
  title: 'New request',
  lineup: [['reader'], ['summarizer']],
  async run(c) {
    const { run, ws, today } = c;
    run.orch('No routine fits, so I’m planning this one myself.');
    run.msg('orch', 'reader', 'Get context', 'Pull today and open Reminders.');
    const [day, rem] = await Promise.all([ws.getDay(today), ws.getReminders()]);
    run.work('reader', `Today has ${day?.newTasks.length ?? 0} new tasks. ${rem.length} open Reminders.`);
    run.msg('reader', 'summarizer', 'Context', 'Here is today and the Reminders.');
    const r = await think(c, 'summarizer', 'best',
      `Request: "${c.task}"\nToday (${today}): ${day?.newTasks.map((t) => clean(t.text)).join('; ') || 'nothing'}\nOpen Reminders: ${rem.map((x) => `${x.name}${x.due ? ' (' + x.due + ')' : ''}`).join('; ')}`,
      'You are the planner for a personal agent. Answer the request in 2 to 4 plain sentences using the context, and draft a reusable routine for it. Reply with only JSON: {"answer": string, "routine": {"name": string, "triggers": [string], "steps": string}}. Triggers are short lowercase phrases. Steps is markdown.',
      () => JSON.stringify({ answer: 'I don’t have a routine for that yet, and no model is available to plan it. I saved a starter routine you can edit.', routine: { name: c.task, triggers: [c.task.toLowerCase().split(' ').slice(0, 3).join(' ')], steps: `1. Read today and open Reminders.\n2. ${c.task}.\n3. Report back.` } }));
    const plan = parseJSON<{ answer: string; routine?: { name: string; triggers: string[]; steps: string } }>(r.text, { answer: r.text });
    run.work('summarizer', short(plan.answer || r.text), r.model);
    run.msg('summarizer', 'orch', 'Answer and a routine', 'Here is an answer, plus a routine draft for next time.', 'reply');
    if (plan.routine?.name) {
      const slug = plan.routine.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'new-routine';
      const [yes] = await run.approve([{ title: `Save the routine ${slug}.md`, why: 'So you can ask for this any time.' }]);
      if (yes) saveRoutine(slug, plan.routine.name, (plan.routine.triggers || []).map((t) => t.replace(/[,]/g, ' ')), plan.routine.steps || '');
    }
    run.orch('Finished.');
    run.emit({ t: 'result', say: plan.answer || r.text });
  },
};

export const FLOWS: Record<string, Flow> = {
  'finish-day': finishDay, 'morning-brief': morningBrief, groceries, 'add-task': addTask, 'whats-due': whatsDue, portfolio, generic, unplanned,
};
