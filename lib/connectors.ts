import { notionReady } from './workspace/notion';
import { sheetsReady } from './workspace/sheets';
import { PUBLIC_DEMO } from './visitor';

export interface Connector { id: string; name: string; does: string; connected: boolean; setup: string }

// Notion and Sheets are wired up today. The rest are listed so you can see what's next.
export function connectors(): Connector[] {
  const list: Connector[] = [
    { id: 'notion', name: 'Notion', does: 'Tasks, Reminders and Notes.', connected: notionReady() && process.env.WORKSPACE === 'notion', setup: 'Add NOTION_TOKEN and the page IDs to .env.local, then set WORKSPACE=notion.' },
    { id: 'sheets', name: 'Google Sheets', does: 'Your Stocks sheet.', connected: sheetsReady(), setup: 'Add GOOGLE_SERVICE_ACCOUNT_JSON and STOCKS_SHEET_ID to .env.local.' },
    { id: 'docs', name: 'Google Docs', does: 'Weekly recaps as documents.', connected: false, setup: 'Coming next: uses the same Google service account.' },
    { id: 'calendar', name: 'Google Calendar', does: 'Deadlines and events.', connected: false, setup: 'Coming next: uses the same Google service account.' },
    { id: 'gmail', name: 'Gmail', does: 'Bills and school emails.', connected: false, setup: 'Coming next: needs a Google OAuth sign-in.' },
    { id: 'drive', name: 'Google Drive', does: 'Files like drafts and reports.', connected: false, setup: 'Coming next: uses the same Google service account.' },
    { id: 'github', name: 'GitHub', does: 'Issues and pull requests.', connected: false, setup: 'Coming next: add a GITHUB_TOKEN.' },
  ];
  // The public demo's fake workspace stands in for Notion and Sheets. The others aren't built yet.
  if (!PUBLIC_DEMO) return list;
  return list.map((c) => (c.id === 'notion' || c.id === 'sheets' ? { ...c, connected: true, does: c.does + ' Fake sample data in this demo.', setup: 'Public demo: connected to fake sample data.' } : c));
}
