import fs from 'node:fs';
import type { SnapshotRow } from '../types';

// Google Sheets "Stocks" › "Daily Snapshot": headers in row 5, data from row 6. Columns A–M.
async function token(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  const creds = JSON.parse(raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8'));
  const { JWT } = await import('google-auth-library');
  const jwt = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const t = await jwt.getAccessToken();
  return t.token!;
}

const base = () => `https://sheets.googleapis.com/v4/spreadsheets/${process.env.STOCKS_SHEET_ID}/values`;

export function sheetsReady(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.STOCKS_SHEET_ID);
}

export async function lastSnapshot(): Promise<SnapshotRow | null> {
  const r = await fetch(`${base()}/${encodeURIComponent("'Daily Snapshot'!A6:M")}`, { headers: { authorization: `Bearer ${await token()}` } });
  if (!r.ok) throw new Error('Sheets read failed: ' + r.status);
  const rows: string[][] = (await r.json()).values || [];
  const last = rows.filter((x) => x[0]).pop();
  if (!last) return null;
  const num = (i: number) => Number(String(last[i] ?? '0').replace(/[^0-9.-]/g, '')) || 0;
  return { date: last[0], brokerA: [num(1), num(2), num(3)], brokerB: [num(4), num(5), num(6)], wallet: [num(7), num(8), num(9)], rate: num(10), notes: last[12] || '' };
}

export async function appendSnapshot(row: SnapshotRow): Promise<void> {
  const r = await fetch(`${base()}/${encodeURIComponent("'Daily Snapshot'!A6:M")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ values: [[row.date, ...row.brokerA, ...row.brokerB, ...row.wallet, row.rate, '=INDIRECT("B"&ROW())+INDIRECT("C"&ROW())+INDIRECT("E"&ROW())+INDIRECT("F"&ROW())+INDIRECT("H"&ROW())+INDIRECT("I"&ROW())', row.notes]] }) });
  if (!r.ok) throw new Error('Sheets write failed: ' + r.status);
}
