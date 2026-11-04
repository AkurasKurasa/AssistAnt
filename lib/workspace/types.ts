import type { DayBlock, Item, Note, Reminder, SnapshotRow } from '../types';

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
}
