import type { AgentId, Tier } from './types';

export interface AgentDef {
  id: AgentId;
  name: string;
  tier: Tier;
  role: string;
  with: string;
}

// The crew. "tier" decides which line of models an agent asks for; "code" never calls a model.
export const AGENTS: AgentDef[] = [
  { id: 'reader', name: 'Reader', tier: 'code', role: 'Reads your Tasks page, Reminders, Notes and the Stocks sheet. Plain code, so it’s instant and free.', with: 'Hands data to everyone. Answers their lookups.' },
  { id: 'summarizer', name: 'Summarizer', tier: 'smart', role: 'Turns your checked and unchecked items into a short, kind summary of the day.', with: 'Gets today from Reader. Reports to the Orchestrator.' },
  { id: 'matcher', name: 'Matcher', tier: 'code', role: 'Matches what you finished to the right Reminders, even when the names don’t quite line up.', with: 'Asks Reader for details. Feeds Planner.' },
  { id: 'scout', name: 'Notes Scout', tier: 'best', role: 'Reads your Worries note and other notes for deadlines that never made it into Reminders.', with: 'Flags guesses to Planner for your OK.' },
  { id: 'chores', name: 'Chore Keeper', tier: 'code', role: 'Keeps every chore cadence going: every two weeks, monthly, Saturdays only.', with: 'Feeds Planner the next due dates.' },
  { id: 'planner', name: 'Planner', tier: 'code', role: 'Builds tomorrow: deadlines due within three days, leftovers, then a fresh copy of the routine.', with: 'Collects from the analysts. Briefs Writer.' },
  { id: 'writer', name: 'Writer', tier: 'code', role: 'The only one allowed to change Notion or Sheets. Risky changes wait for you first.', with: 'Takes plans from Planner. Fixes what Checker finds.' },
  { id: 'checker', name: 'Checker', tier: 'code', role: 'Re-reads everything after Writer finishes and sends back anything that looks wrong.', with: 'Reviews Writer. Signs off to the Orchestrator.' },
  { id: 'grocer', name: 'Grocery Clerk', tier: 'fast', role: 'Looks after the Grocery List: adds items, skips duplicates and obvious synonyms.', with: 'Checks with Reader. Hands Writer the changes.' },
  { id: 'briefer', name: 'Briefer', tier: 'smart', role: 'Writes the morning brief: what matters today, what’s due soon, what’s worrying you.', with: 'Asks Notes Scout about worries.' },
  { id: 'clerk', name: 'Portfolio Clerk', tier: 'code', role: 'Logs two brokerage accounts and a crypto wallet, converting the wallet to dollars at the day’s rate.', with: 'Asks Reader for the rate. Hands Writer the row.' },
];

export const AGENT_BY_ID: Record<AgentId, AgentDef> = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>;
