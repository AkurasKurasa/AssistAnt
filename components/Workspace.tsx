'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DayBlock, Item, Reminder, SnapshotRow } from '@/lib/types';
import type { Change, Doc } from '@/lib/workspace/types';

// The fake Notion, Google Sheets and Google Docs the crew works on, shown live under the floor.
// Anything changed since the run started is tinted orange and tagged "just now".
type App = 'notion' | 'sheets' | 'docs';
interface View { mode: 'demo'; today: string; days: DayBlock[]; reminders: Reminder[]; groceries: string[]; snapshots: SnapshotRow[]; docs: Doc[]; changes: Change[] }
const APPS: { id: App; name: string; logo: string }[] = [
  { id: 'notion', name: 'Notion', logo: '/logos/notion.png' },
  { id: 'sheets', name: 'Google Sheets', logo: '/logos/sheets.png' },
  { id: 'docs', name: 'Google Docs', logo: '/logos/docs.png' },
];

const dayLabel = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
const short = (d: string | null) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const done = (i: Item) => i.checked || (!!i.children?.length && i.children.every(done));

export default function Workspace({ refresh, since }: { refresh: number; since: number | null }) {
  const [data, setData] = useState<View | null>(null);
  const [app, setApp] = useState<App>('notion');
  const [doc, setDoc] = useState<string | null>(null);
  const lastSeen = useRef(0);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/workspace').then((r) => r.json()).then((j) => { if (live && j.mode === 'demo') setData(j as View); }).catch(() => { /* keep the last view */ });
    return () => { live = false; };
  }, [refresh]);

  const fresh = useMemo(() => (data && since ? data.changes.filter((c) => c.at >= since) : []), [data, since]);
  const isNew = (ref: string) => fresh.some((c) => c.ref === ref);

  // Follow the crew: jump to the app (and doc) of the newest change.
  useEffect(() => {
    const last = fresh[fresh.length - 1];
    if (!last || last.at <= lastSeen.current) return;
    lastSeen.current = last.at;
    setApp(last.app);
    if (last.app === 'docs') setDoc(last.ref);
  }, [fresh]);

  // Scroll the panel (not the page) so the newest highlighted item is in view.
  useEffect(() => {
    const body = panel.current?.querySelector<HTMLElement>('.ws-body');
    const marks = body?.querySelectorAll<HTMLElement>('.ws-new');
    const el = marks?.[marks.length - 1];
    if (!body || !el) return;
    const delta = el.getBoundingClientRect().top - body.getBoundingClientRect().top;
    if (delta < 0 || delta > body.clientHeight - 60) body.scrollTo({ top: body.scrollTop + delta - 60, behavior: 'smooth' });
  }, [fresh, app, doc]);

  if (!data) return <section className="ws" aria-label="Workspace"><p className="none ws-empty">The fake workspace appears here.</p></section>;
  const count = (a: App) => fresh.filter((c) => c.app === a).length;
  const New = ({ on }: { on: boolean }) => (on ? <span className="ws-tag">just now</span> : null);

  return (
    <section className="ws" aria-label="Workspace" ref={panel}>
      <div className="ws-head">
        <h2>Workspace <small>fake demo data · changes show up live</small></h2>
        <div className="ws-tabs" role="tablist" aria-label="Apps">
          {APPS.map((a) => (
            <button key={a.id} role="tab" type="button" aria-selected={app === a.id} className="ws-tab" onClick={() => setApp(a.id)}>
              <img src={a.logo} alt="" width={16} height={16} />{a.name}{count(a.id) > 0 && <span className="ws-count">{count(a.id)}</span>}
            </button>
          ))}
        </div>
      </div>

      {app === 'notion' && (
        <div className="ws-body ws-notion">
          <div className="ws-crumb">Demo workspace / <b>Tasks</b></div>
          {data.days.map((d) => (
            <div key={d.id} className={'nt-day' + (isNew(d.id) ? ' ws-new' : '')}>
              <h3>{dayLabel(d.date)}{d.date === data.today && <span className="nt-today">today</span>}<New on={isNew(d.id)} /></h3>
              {d.newTasks.length === 0 && <p className="none">No new tasks.</p>}
              <ul className="nt-list">
                {d.newTasks.map((t) => (
                  <li key={t.id} className={isNew(t.id) ? 'ws-new' : ''}>
                    <span className={'nt-box' + (done(t) ? ' on' : '')} aria-hidden="true" />
                    <span className={t.skipped ? 'nt-skip' : done(t) ? 'nt-done' : ''}>{t.text.replace(/^🎯\s*/, '')}</span><New on={isNew(t.id)} />
                    {!!t.children?.length && <ul className="nt-list sub">{t.children.map((c) => <li key={c.id}><span className={'nt-box' + (c.checked ? ' on' : '')} aria-hidden="true" /><span className={c.checked ? 'nt-done' : ''}>{c.text}</span></li>)}</ul>}
                  </li>
                ))}
              </ul>
              <details className="nt-routine"><summary>Routine · {d.templateItems.filter(done).length} of {d.templateItems.length} done</summary>
                <ul className="nt-list">{d.templateItems.map((t) => <li key={t.id}><span className={'nt-box' + (done(t) ? ' on' : '')} aria-hidden="true" /><span className={done(t) ? 'nt-done' : ''}>{t.text}</span></li>)}</ul>
              </details>
            </div>
          ))}

          <h3 className="nt-h">Reminders</h3>
          <div className="ws-scroll"><table className="nt-table">
            <thead><tr><th>Name</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead>
            <tbody>{[...data.reminders].sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).map((r) => (
              <tr key={r.id} className={isNew(r.id) ? 'ws-new' : ''}>
                <td className={r.status === 'Done' ? 'nt-done' : ''}>{r.name}<New on={isNew(r.id)} /></td>
                <td><span className={'nt-pill s-' + r.status.replace(/\s/g, '').toLowerCase()}>{r.status}</span></td>
                <td>{r.priority}</td><td>{short(r.due)}</td>
              </tr>))}</tbody>
          </table></div>

          <h3 className="nt-h">Grocery List</h3>
          <ul className="nt-grocery">{data.groceries.map((g) => <li key={g} className={isNew('g:' + g.toLowerCase()) ? 'ws-new' : ''}>{g}<New on={isNew('g:' + g.toLowerCase())} /></li>)}</ul>
        </div>
      )}

      {app === 'sheets' && (
        <div className="ws-body ws-sheets">
          <div className="ws-crumb">Stocks / <b>Daily Snapshot</b></div>
          <div className="ws-scroll"><table className="sh-grid">
            <thead>
              <tr><th className="sh-n" />{'ABCDEFGHIJKLM'.split('').map((c) => <th key={c}>{c}</th>)}</tr>
              <tr className="sh-head"><td className="sh-n">1</td><td>Date</td><td>Broker 1</td><td>cash</td><td>deposit</td><td>Broker 2</td><td>cash</td><td>deposit</td><td>Wallet</td><td>cash</td><td>deposit</td><td>Rate</td><td>Total</td><td>Notes</td></tr>
            </thead>
            <tbody>{data.snapshots.map((s, i) => {
              const total = s.brokerA[0] + s.brokerA[1] + s.brokerB[0] + s.brokerB[1] + s.wallet[0] + s.wallet[1];
              return (
                <tr key={s.date + i} className={isNew('s:' + s.date) ? 'ws-new' : ''}>
                  <td className="sh-n">{i + 2}</td><td>{short(s.date)}</td>
                  {[...s.brokerA, ...s.brokerB, ...s.wallet].map((v, k) => <td key={k} className="sh-num">{money(v)}</td>)}
                  <td className="sh-num">{s.rate ? s.rate.toFixed(2) : '—'}</td><td className="sh-num sh-total">{money(total)}</td><td className="sh-note">{s.notes}<New on={isNew('s:' + s.date)} /></td>
                </tr>);
            })}</tbody>
          </table></div>
        </div>
      )}

      {app === 'docs' && (
        <div className="ws-body ws-docs">
          {data.docs.length === 0 ? (
            <p className="none ws-empty">No documents yet. Run <b>Finish day</b> or the <b>Morning brief</b> and the crew writes one here.</p>
          ) : (
            <div className="dc-wrap">
              <ul className="dc-list">{[...data.docs].reverse().map((d) => (
                <li key={d.id}><button type="button" className={(doc ?? data.docs[data.docs.length - 1].id) === d.id ? 'on' : ''} onClick={() => setDoc(d.id)}>{d.title}<New on={isNew(d.id)} /></button></li>))}</ul>
              {(() => {
                const d = data.docs.find((x) => x.id === doc) ?? data.docs[data.docs.length - 1];
                return (
                  <article className={'dc-page' + (isNew(d.id) ? ' ws-new' : '')}>
                    <h3>{d.title}</h3>
                    {d.body.split('\n\n').map((block, k) => {
                      const lines = block.split('\n');
                      const head = lines[0] && !lines[0].startsWith('- ') && lines.length > 1 ? lines.shift() : null;
                      return (
                        <div key={k}>
                          {head && <h4>{head}</h4>}
                          {lines.every((l) => l.startsWith('- ')) ? <ul>{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul> : <p>{lines.join(' ')}</p>}
                        </div>);
                    })}
                  </article>);
              })()}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
