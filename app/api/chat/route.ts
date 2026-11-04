import { search, stats } from '@/lib/kb';
import { getChat, newChat, saveChat, type Source, type Turn } from '@/lib/chat';
import { ask, parseJSON } from '@/lib/llm/router';
import { matchRoutine } from '@/lib/engine/routines';
import { startRun } from '@/lib/engine/orchestrator';
import { activeRun } from '@/lib/engine/run';
import { workspace } from '@/lib/workspace';
import { today, weekday, shortDate } from '@/lib/time';
import { tooFast, visitorRoute } from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One chat message. Streams newline-delimited JSON events:
//   {t:'chat', id} {t:'step', text} {t:'sources', items} {t:'answer', text, model} {t:'run', id, title} {t:'done'}
const DOING = /^(please\s+)?(add|put|remind|schedule|log|plan|make|create|move|mark|clear|run|start|update|buy)\b/i;

export const POST = visitorRoute(async function POST(req: Request) {
  if (tooFast(req)) return Response.json({ error: 'That’s a lot of messages. Give it a minute.' }, { status: 429 });
  const { message, chatId } = await req.json();
  const q = String(message || '').trim().slice(0, 1000);
  if (!q) return Response.json({ error: 'Type something first.' }, { status: 400 });
  const chat = (chatId && getChat(chatId)) || newChat(q);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (e: object) => ctrl.enqueue(enc.encode(JSON.stringify(e) + '\n'));
      const turn: Turn = { q, steps: [], answer: '', sources: [], at: new Date().toISOString() };
      const step = (text: string) => { turn.steps.push(text); send({ t: 'step', text }); };
      send({ t: 'chat', id: chat.id });

      try {
        // Questions go to the Knowledge Base; requests to do something go to the crew.
        const question = /\?\s*$/.test(q) || /^(what|when|where|who|why|how|which|do|does|did|is|are|am|can|could|should|would|will|have|has|tell me|explain|summari[sz]e|remind me what)\b/i.test(q);
        const matched = matchRoutine(q);
        const routine = matched && (!question || /finish-day|groceries|add-task|portfolio/.test(matched.flow)) ? matched : null;
        if (routine || (!question && DOING.test(q))) {
          // A task: hand it to the crew.
          step(routine ? `This is a task. It matches the ${routine.name} routine.` : 'This is a task with no routine yet, so the Orchestrator will plan it.');
          const busy = activeRun();
          if (busy) {
            step('The crew is still busy with the last task.');
            turn.answer = 'The crew is still working on the last task. Open the live view to see it, or ask again when it’s done.';
            turn.run = { id: busy.id, title: busy.task };
          } else {
            const run = startRun(q);
            step('Handed it to the crew.');
            turn.run = { id: run.id, title: routine?.name || 'New request' };
            turn.answer = `The crew is on it. ${routine?.name || 'This task'} is running now, and anything risky will wait for your OK in the live view.`;
          }
          send({ t: 'run', ...turn.run });
          send({ t: 'answer', text: turn.answer, model: 'orchestrator' });
        } else {
          await answerFromNotes(q, chat.turns, turn, step, send);
        }
      } catch (e: any) {
        turn.answer = 'Something went wrong while answering. ' + (e?.message || '');
        send({ t: 'answer', text: turn.answer, model: 'error' });
      }

      chat.turns.push(turn);
      saveChat(chat);
      send({ t: 'done' });
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' } });
});

async function answerFromNotes(q: string, history: Turn[], turn: Turn, step: (t: string) => void, send: (e: object) => void) {
  const ws = workspace();
  const { docs } = stats();
  let passages: { title: string; text: string }[] = [];

  if (docs) {
    const { hits, terms } = search(q + ' ' + (history.at(-1)?.q || ''), 6);
    step(terms.length ? `Searching your Knowledge Base for “${terms.slice(0, 6).join(', ')}”.` : 'Looking through your Knowledge Base.');
    passages = hits.map((h) => ({ title: h.title, text: h.text }));
    step(hits.length ? `Found ${hits.length} passage${hits.length > 1 ? 's' : ''} in ${[...new Set(hits.map((h) => h.title))].slice(0, 3).join(', ')}.` : 'Nothing in your notes matches closely.');
  } else {
    step('Your Knowledge Base is empty, so I’m reading your Notes pages directly.');
    passages = (await ws.getNotes()).filter((n) => n.text.trim()).map((n) => ({ title: n.title, text: n.text.slice(0, 1500) }));
  }

  // A little live context helps with "what's due", "what's on tomorrow" and so on.
  const [rem, day] = await Promise.all([ws.getReminders().catch(() => []), ws.getDay(today()).catch(() => null)]);
  step(`Checked today (${weekday(today())}) and ${rem.length} open Reminders.`);

  turn.sources = passages.map((p, i) => ({ n: i + 1, title: p.title, snippet: p.text.replace(/\s+/g, ' ').slice(0, 160) } as Source));
  send({ t: 'sources', items: turn.sources });

  const context = passages.map((p, i) => `[${i + 1}] ${p.title}\n${p.text}`).join('\n\n');
  const live = `Today is ${weekday(today())}, ${today()}. New tasks today: ${day?.newTasks.map((t) => t.text).join('; ') || 'none'}. Open Reminders: ${rem.map((r) => `${r.name}${r.due ? ` (due ${shortDate(r.due)}, ${r.priority})` : ''}`).join('; ') || 'none'}.`;
  const past = history.slice(-3).map((t) => `User: ${t.q}\nYou: ${t.answer}`).join('\n');

  step('Writing the answer.');
  const r = await ask('best',
    `${past ? 'Earlier in this chat:\n' + past + '\n\n' : ''}Question: ${q}\n\nLive context: ${live}\n\nNotes:\n${context || '(no notes)'}`,
    'You are AssistAnt, a personal agent. Answer from the user’s notes and the live context. Cite notes like [1] or [2]. If the notes don’t cover it, say so plainly and don’t invent facts. Keep it short and warm, in plain prose with no headings. Reply with only JSON: {"steps": [up to 4 short phrases on how you worked it out], "answer": string}.',
    (m) => step('Router: ' + m));

  if (!r) {
    turn.answer = passages.length
      ? `I couldn’t reach a model, so here’s the closest part of your notes. From “${passages[0].title}”: ${passages[0].text.replace(/\s+/g, ' ').slice(0, 320)}`
      : 'I couldn’t reach a model and found nothing in your notes about that.';
    turn.model = 'plain rules';
  } else {
    const j = parseJSON<{ steps?: string[]; answer?: string }>(r.text, {});
    (j.steps || []).slice(0, 4).forEach((s) => step(String(s)));
    turn.answer = (j.answer || r.text).trim();
    turn.model = r.model;
  }
  send({ t: 'answer', text: turn.answer, model: turn.model });
}
