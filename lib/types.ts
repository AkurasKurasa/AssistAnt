export type Tier = 'code' | 'fast' | 'smart' | 'best';

export type AgentId =
  | 'reader' | 'summarizer' | 'matcher' | 'scout' | 'chores' | 'planner'
  | 'writer' | 'checker' | 'grocer' | 'briefer' | 'clerk';

export type NodeId = AgentId | 'orch';

export interface Item {
  id: string;
  text: string;
  checked: boolean;
  skipped: boolean;
  children?: Item[];
}

export interface DayBlock {
  id: string;
  date: string;
  heading: string;
  newTasks: Item[];
  templateItems: Item[];
}

export interface Reminder {
  id: string;
  name: string;
  status: 'Not started' | 'In progress' | 'Done';
  priority: string;
  due: string | null; // end date when the reminder is a range
}

export interface Note {
  title: string;
  text: string;
}

export interface SnapshotRow {
  date: string;
  brokerA: [number, number, number];
  brokerB: [number, number, number];
  wallet: [number, number, number]; // already in USD
  rate: number;
  notes: string;
}

export interface AskItem { title: string; why: string }
export interface AskField { key: string; label: string; placeholder?: string }

export type RunEvent =
  | { t: 'start'; task: string; scheduled?: boolean; at?: number } // at: server time the run started (ms)
  | { t: 'plan'; title: string; lineup: AgentId[][] }
  | { t: 'orch'; text: string }
  | { t: 'msg'; from: NodeId | 'you'; to: NodeId | 'you'; label: string; text: string; kind?: 'reply' | 'alert' }
  | { t: 'work'; agent: AgentId; text: string; model: string }
  | { t: 'state'; agent: AgentId; state: 'waiting' | 'ready' | 'done' }
  | { t: 'sys'; text: string }
  | { t: 'ask'; id: string; kind: 'approve'; items: AskItem[] }
  | { t: 'ask'; id: string; kind: 'form'; title: string; fields: AskField[] }
  | { t: 'answered'; id: string }
  | { t: 'result'; say: string; rows?: [string, string][]; note?: string }
  | { t: 'error'; text: string }
  | { t: 'end' };
