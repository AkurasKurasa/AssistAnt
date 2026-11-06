'use client';

import { useEffect, useState } from 'react';
import { AGENT_BY_ID } from '@/lib/agents';
import type { AgentId } from '@/lib/types';
import type { Change } from '@/lib/workspace/types';
import { ICON } from './icons';
import AntLoader from './AntLoader';

// The Live view as a sidebar: a compact, vertical version of the floor that works next to chat.
export interface CrewCard { state: string; text: string; model: string }
interface Msg { from: string; to?: string; text: string; kind?: string; at: string }
interface Props {
  open: boolean; onClose: () => void; onFull: () => void;
  running: boolean; title: string; since: number | null;
  lineup: string[]; crew: Record<string, CrewCard>; msgs: Msg[]; refresh: number;
}
const LOGO: Record<Change['app'], string> = { notion: '/logos/notion.png', sheets: '/logos/sheets.png', docs: '/logos/docs.png' };
const nameOf = (id?: string) => (!id ? '' : id === 'orch' ? 'Orchestrator' : id === 'you' ? 'You' : AGENT_BY_ID[id as AgentId]?.name || id);
const STATE_LABEL: Record<string, string> = { queued: 'queued', working: 'working', listening: 'listening', ready: 'ready', waiting: 'waiting for you', done: 'done' };

export default function LiveSidebar({ open, onClose, onFull, running, title, since, lineup, crew, msgs, refresh }: Props) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    fetch('/api/workspace').then((r) => r.json()).then((j) => setChanges((j.changes || []).filter((c: Change) => since !== null && c.at >= since))).catch(() => {});
  }, [open, refresh, since]);
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);

  return (
    <aside className={'live-side' + (open ? ' open' : '')} aria-label="Live" aria-hidden={!open} inert={!open || undefined}>
      <header className="ls-head">
        <strong>Live</strong>
        <button type="button" className="ls-close" onClick={onClose} aria-label="Close the Live sidebar">{'×'}</button>
      </header>

      <div className="ls-status">
        {running ? <AntLoader size={52} /> : <span className={'ls-dot' + (lineup.length ? ' done' : '')} />}
        <div>
          <b>{running ? `${title || 'The crew'} is working` : lineup.length ? `${title || 'Run'} finished` : 'Waiting for a task'}</b>
          <small>{running && since ? `${Math.max(0, Math.round((now - since - 1000) / 1000))}s` : lineup.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} to the workspace` : 'Ask or give AssistAnt a task to see the crew here.'}</small>
        </div>
      </div>

      {lineup.length > 0 && (
        <ol className="ls-crew">
          {lineup.map((id) => {
            const c = crew[id] || { state: 'queued', text: '', model: '' };
            return (
              <li key={id} className={'ls-agent s-' + c.state}>
                <span className="ls-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[id] || '' }} /></span>
                <div className="ls-body">
                  <div className="ls-name">{nameOf(id)} <span className="ls-state">{STATE_LABEL[c.state] || c.state}</span>{c.model && <span className="ls-model">{c.model}</span>}</div>
                  {c.text && <p className="ls-text">{c.text}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {changes.length > 0 && (
        <section className="ls-sec">
          <h3>What changed <small>{changes.length}</small></h3>
          <ul className="ls-changes">{changes.slice(-8).map((c) => <li key={c.id}><img src={LOGO[c.app]} alt="" width={14} height={14} />{c.what}</li>)}</ul>
        </section>
      )}

      {msgs.length > 0 && (
        <section className="ls-sec">
          <h3>Messages <small>{msgs.filter((m) => m.kind !== 'sys').length}</small></h3>
          <ul className="ls-msgs">{msgs.filter((m) => m.kind !== 'sys').slice(-6).map((m, i) => (
            <li key={i} className={m.kind || ''}><span className="ls-msg-h">{nameOf(m.from)}{m.to && <> {'→'} {nameOf(m.to)}</>}</span>{m.text}</li>
          ))}</ul>
        </section>
      )}

      <button type="button" className="ls-full" onClick={onFull}>Open the full Live view {'→'}</button>
    </aside>
  );
}
