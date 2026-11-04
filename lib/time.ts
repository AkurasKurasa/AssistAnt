// All dates are YYYY-MM-DD strings in TIMEZONE (an IANA name such as Europe/Berlin), UTC by default.
export const TZ = process.env.TIMEZONE || 'UTC';

export function today(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(ymd: string): string {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

export function shortDate(ymd: string): string {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function hhmm(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 86400000);
}

// Label a deadline the way the Tasks page expects: "(due today)" or "(due Thu, Oct 29)".
export function dueLabel(due: string, dayOfBlock: string): string {
  return due === dayOfBlock ? 'due today' : 'due ' + shortDate(due);
}
