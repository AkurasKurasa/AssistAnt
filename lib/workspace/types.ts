import type { DayBlock, Item, Note, Reminder, SnapshotRow } from '../types';

export interface Doc { id: string; title: string; body: string; updatedAt: string }
// One change the crew made, so the Live view can show and highlight it.
export interface Change { id: string; at: number; app: 'notion' | 'sheets' | 'docs'; what: string; ref: string }

export interface NewTask { text: string; children?: string[] }

// Everything the crew can read or change. Demo and Notion both implement this.
export interface Workspace {
  mode: 'demo' | 'notion';
  getDay(date: string): Promise<DayBlock | null>;
  getTemplate(weekday: string): Promise<Item[]>;
  buildDay(date: string, after: string | null, tasks: NewTask[]): Promise<void>;
  addTasks(date: string, tasks: NewTask[]): Promise<void>;
  removeDay(block: DayBlock): Promise<void>;

  getReminders(): Promise<Reminder[]>; // open ones only
  markDone(id: string): Promise<void>;
  setDue(id: string, due: string): Promise<void>;
  createReminder(r: { name: string; due: string; priority: string }): Promise<void>;

  getNotes(): Promise<Note[]>;
  getGroceries(): Promise<string[]>;
  addGroceries(items: string[]): Promise<void>;

  lastSnapshot(): Promise<SnapshotRow | null>;
  appendSnapshot(row: SnapshotRow): Promise<void>;

  writeDoc?(title: string, body: string): Promise<void>; // only the demo has Docs so far
}
