import { Run, runs } from './run';
import { FLOWS } from './flows';
import { matchRoutine } from './routines';
import { workspace } from '../workspace';
import { today } from '../time';

// Reads what you asked, picks a routine (or plans it), and runs the crew.
export function startRun(task: string, opts: { scheduled?: boolean } = {}): Run {
  const run = new Run(task);
  runs.set(run.id, run);
  for (const [id, r] of runs) if (r.done && Date.now() - r.startedAt > 6 * 3600_000) runs.delete(id);

  (async () => {
    run.emit({ t: 'start', task, scheduled: opts.scheduled });
    run.msg('you', 'orch', task, task);
    try {
      const routine = matchRoutine(task);
      const flow = routine ? FLOWS[routine.flow] || FLOWS.generic : FLOWS.unplanned;
      run.emit({ t: 'plan', title: routine?.name || flow.title, lineup: flow.lineup });
      if (routine) run.sys(`Matched routine ${routine.slug}.md.`);
      await flow.run({ run, ws: workspace(), today: today(), task, routineBody: routine?.body });
    } catch (e: any) {
      run.emit({ t: 'error', text: e?.message || String(e) });
      run.emit({ t: 'result', say: 'Something went wrong, so I stopped. Nothing after the error was changed.', note: e?.message });
    }
    run.emit({ t: 'end' });
  })();

  return run;
}
