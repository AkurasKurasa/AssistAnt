import { hhmm, today } from './time';
import { getState, save } from './state';
import { startRun } from './engine/orchestrator';
import { PUBLIC_DEMO } from './visitor';

// Runs finish-day and the morning brief on time (in TIMEZONE). Approvals wait until you open the app.
const JOBS = [
  { key: 'finish-day', task: 'Run my finish-day', at: () => process.env.FINISH_DAY_TIME || '22:10' },
  { key: 'morning-brief', task: 'Give me my morning brief', at: () => process.env.MORNING_BRIEF_TIME || '07:00' },
];

export function startScheduler(): void {
  if (PUBLIC_DEMO) return; // nobody's day to wrap up on the public demo
  const g = globalThis as unknown as { __sched?: boolean };
  if (g.__sched) return;
  g.__sched = true;
  setInterval(() => {
    const now = hhmm(), d = today(), s = getState();
    for (const j of JOBS) {
      if (now === j.at() && s.lastScheduled[j.key] !== d) {
        s.lastScheduled[j.key] = d; save();
        startRun(j.task, { scheduled: true });
      }
    }
  }, 20_000);
}
