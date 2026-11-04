import type { AgentId, AskField, AskItem, NodeId, RunEvent } from '../types';
import { visitorId } from '../visitor';

type Sub = (e: RunEvent) => void;

// One request from start to finish, owned by the visitor who started it. Events are kept so a page opened later can replay them.
export class Run {
  id = Math.random().toString(36).slice(2, 10);
  events: RunEvent[] = [];
  subs = new Set<Sub>();
  pending = new Map<string, (v: any) => void>();
  done = false;
  startedAt = Date.now();
  visitor = visitorId();

  constructor(public task: string) {}

  emit(e: RunEvent) {
    this.events.push(e);
    for (const s of this.subs) s(e);
    if (e.t === 'end') this.done = true;
  }
  orch(text: string) { this.emit({ t: 'orch', text }); }
  sys(text: string) { this.emit({ t: 'sys', text }); }
  msg(from: NodeId | 'you', to: NodeId | 'you', label: string, text = label, kind?: 'reply' | 'alert') { this.emit({ t: 'msg', from, to, label, text, kind }); }
  work(agent: AgentId, text: string, model = 'plain code') { this.emit({ t: 'work', agent, text, model }); }
  state(agent: AgentId, state: 'waiting' | 'ready' | 'done') { this.emit({ t: 'state', agent, state }); }

  approve(items: AskItem[]): Promise<boolean[]> {
    const id = 'ask-' + this.events.length;
    this.emit({ t: 'ask', id, kind: 'approve', items });
    return new Promise((res) => this.pending.set(id, (v) => { this.emit({ t: 'answered', id }); res(v); }));
  }
  form(title: string, fields: AskField[]): Promise<Record<string, string>> {
    const id = 'ask-' + this.events.length;
    this.emit({ t: 'ask', id, kind: 'form', title, fields });
    return new Promise((res) => this.pending.set(id, (v) => { this.emit({ t: 'answered', id }); res(v); }));
  }
  answer(id: string, value: unknown): boolean {
    const r = this.pending.get(id);
    if (!r) return false;
    this.pending.delete(id);
    r(value);
    return true;
  }
}

const g = globalThis as unknown as { __runs?: Map<string, Run> };
export const runs: Map<string, Run> = g.__runs || (g.__runs = new Map());

export function activeRun(): Run | null {
  let latest: Run | null = null;
  for (const r of runs.values()) if (!r.done && r.visitor === visitorId() && (!latest || r.startedAt > latest.startedAt)) latest = r;
  return latest;
}

// A run only the visitor who started it can watch or answer.
export function ownRun(id: string): Run | null {
  const r = runs.get(id);
  return r && r.visitor === visitorId() ? r : null;
}
