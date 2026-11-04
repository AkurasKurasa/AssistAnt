'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENTS, AGENT_BY_ID } from '@/lib/agents';
import type { AskField, AskItem, RunEvent } from '@/lib/types';
import { ICON, LOGO_SVG, ENG_LABEL } from './icons';
import { Floor } from './floor';
import Chat from './Chat';

type View = 'meet' | 'live' | 'kb' | 'src' | 'con';
interface ChatMeta { id: string; title: string; updatedAt: string; turns: number }
interface KbDoc { id: string; title: string; source: string; addedAt: string; parts: number; chars: number }
interface Msg { from: string; to?: string; text: string; kind?: string; at: string }
type Tray =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'approve'; id: string; items: AskItem[]; answers: (boolean | undefined)[] }
  | { kind: 'form'; id: string; title: string; fields: AskField[] }
  | { kind: 'result'; say: string; rows?: [string, string][]; note?: string };

interface Source { id: string; vendor: string; name: string; health: string; label: string; detail: string; on: boolean; configurable: boolean; sub?: boolean; paid?: boolean; cap: number; keyUrl?: string; trains?: boolean; keyless?: boolean; catalog?: boolean }
interface Connector { id: string; name: string; does: string; connected: boolean; setup: string }

const SUGGEST = ['Run my finish-day', 'What’s worrying me this week?', 'Add eggs to groceries'];
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const nameOf = (id?: string) => (!id ? '' : id === 'orch' ? 'Orchestrator' : id === 'you' ? 'You' : AGENT_BY_ID[id as keyof typeof AGENT_BY_ID]?.name || id);
const clock = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const Svg = ({ path, size = 22 }: { path: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: path }} />
);

export default function App() {
  const [view, setView] = useState<View>('meet');
  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [tray, setTray] = useState<Tray>({ kind: 'idle' });
  const [error, setError] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [budget, setBudget] = useState(25);
  const [mode, setMode] = useState<'demo' | 'notion'>('demo');
  const [listDate, setListDate] = useState('');
  const [publicDemo, setPublicDemo] = useState(false);
  const [cons, setCons] = useState<Connector[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [install, setInstall] = useState<any>(null);
  const [date, setDate] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatOrigin, setChatOrigin] = useState<DOMRect | null>(null);
  const [chatFirst, setChatFirst] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [kb, setKb] = useState<KbDoc[]>([]);
  const [kbNote, setKbNote] = useState('');
  const [dragging, setDragging] = useState(false);
  const askRef = useRef<HTMLFormElement>(null);

  const floorRef = useRef<HTMLDivElement>(null);
  const floor = useRef<Floor | null>(null);
  const queue = useRef<RunEvent[]>([]);
  const busy = useRef(false);
  const es = useRef<EventSource | null>(null);
  const convoRef = useRef<HTMLDivElement>(null);

  const loadSources = useCallback(async () => {
    const j = await (await fetch('/api/sources')).json();
    setSources(j.sources); setBudget(j.budget); setMode(j.mode); setListDate(j.catalogUpdated || ''); setPublicDemo(!!j.publicDemo);
  }, []);
  const loadCons = useCallback(async () => { setCons((await (await fetch('/api/connectors')).json()).connectors); }, []);
  const loadChats = useCallback(async () => { setChats((await (await fetch('/api/chats')).json()).chats); }, []);
  const loadKb = useCallback(async () => { setKb((await (await fetch('/api/kb')).json()).docs); }, []);

  useEffect(() => {
    setDate(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
    loadSources(); loadCons(); loadChats(); loadKb();
    if (floorRef.current) floor.current = new Floor(floorRef.current);
    const onResize = () => floor.current?.layout();
    window.addEventListener('resize', onResize);
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    fetch('/api/runs/active').then((r) => r.json()).then((j) => { if (j.id) attach(j.id); });
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('beforeinstallprompt', onPrompt); floor.current?.destroy(); es.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (view === 'live') requestAnimationFrame(() => floor.current?.layout()); }, [view]);
  useEffect(() => { convoRef.current?.scrollTo({ top: convoRef.current.scrollHeight }); }, [msgs]);

  const addMsg = (m: Omit<Msg, 'at'>) => setMsgs((x) => [...x, { ...m, at: clock() }]);

  async function handle(e: RunEvent) {
    const f = floor.current!;
    switch (e.t) {
      case 'start': f.reset(); f.busy(true); setMsgs([]); setTray({ kind: 'working' }); setRunning(true); setView('live'); break;
      case 'plan': f.setLineup(e.lineup); await new Promise((r) => setTimeout(r, 700)); break;
      case 'orch': f.orch(e.text); break;
      case 'msg': await f.msg(e.from, e.to, e.label, e.kind); addMsg({ from: e.from, to: e.to, text: e.text, kind: e.kind }); break;
      case 'work': await f.work(e.agent, e.text, e.model); break;
      case 'state': f.setState(e.agent, e.state === 'ready' ? 'ready' : e.state); break;
      case 'sys': addMsg({ from: 'orch', text: e.text, kind: 'sys' }); break;
      case 'ask': setTray(e.kind === 'approve' ? { kind: 'approve', id: e.id, items: e.items, answers: e.items.map(() => undefined) } : { kind: 'form', id: e.id, title: e.title, fields: e.fields }); break;
      case 'answered': setTray({ kind: 'working' }); break;
      case 'result': setTray({ kind: 'result', say: e.say, rows: e.rows, note: e.note }); break;
      case 'error': addMsg({ from: 'orch', text: 'Error: ' + e.text, kind: 'alert' }); break;
      case 'end': f.finish(); setRunning(false); loadSources(); break;
    }
  }

  async function pump() {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length) { try { await handle(queue.current.shift()!); } catch (err) { console.error(err); } }
    busy.current = false;
  }

  function attach(id: string) {
    es.current?.close();
    setRunId(id);
    const src = new EventSource(`/api/runs/${id}`);
    src.onmessage = (m) => { const ev = JSON.parse(m.data) as RunEvent; queue.current.push(ev); pump(); if (ev.t === 'end') src.close(); };
    src.onerror = () => { if (src.readyState === EventSource.CLOSED) setRunning(false); };
    es.current = src;
  }

  async function send(text: string) {
    const t = text.trim() || 'Run my finish-day';
    if (running) return;
    setError('');
    const r = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: t }) });
    const j = await r.json();
    if (!r.ok) { setError(j.error || 'Couldn’t start that.'); if (j.id) attach(j.id); return; }
    setTask(''); attach(j.id);
  }

  function openChat(message: string | null, id: string | null = null) {
    if (message !== null && !message.trim()) return;
    setChatOrigin(askRef.current?.getBoundingClientRect() ?? null);
    setChatFirst(message); setChatId(id); setChatOpen(true);
  }

  function chatClosed() {
    setChatOpen(false); setTask(''); loadChats();
    fetch('/api/runs/active').then((r) => r.json()).then((j) => { if (j.id && j.id !== runId) attach(j.id); });
  }

  async function upload(files: FileList | File[]) {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    setKbNote('Adding\u2026');
    const j = await (await fetch('/api/kb', { method: 'POST', body: fd })).json();
    setKbNote(`${j.added.length ? `Added ${j.added.length} note${j.added.length > 1 ? 's' : ''}.` : ''}${j.skipped?.length ? ` Skipped ${j.skipped.join(', ')} (use .md, .txt, .csv, .json or .html).` : ''}`.trim());
    loadKb();
  }

  async function syncNotes() {
    setKbNote('Reading your Notes pages\u2026');
    const r = await fetch('/api/kb/sync', { method: 'POST' });
    const j = await r.json();
    setKbNote(r.ok ? `Copied ${j.added.length} page${j.added.length === 1 ? '' : 's'} from ${j.mode === 'notion' ? 'Notion' : 'the demo notes'}.` : j.error);
    loadKb();
  }

  async function removeNote(id: string) {
    setKb((await (await fetch('/api/kb?id=' + id, { method: 'DELETE' })).json()).docs);
  }

  async function answer(id: string, value: unknown) {
    await fetch(`/api/runs/${runId}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ask: id, value }) });
  }

  function decide(i: number, v: boolean) {
    if (tray.kind !== 'approve') return;
    const answers = tray.answers.slice(); answers[i] = v;
    addMsg({ from: 'you', to: 'orch', text: (v ? 'Approved: ' : 'Skip: ') + tray.items[i].title, kind: 'reply' });
    setTray({ ...tray, answers });
    if (answers.every((a) => a !== undefined)) answer(tray.id, answers);
  }

  async function patchSource(body: object) {
    const r = await fetch('/api/sources', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json(); setSources(j.sources); setBudget(j.budget);
  }

  const ready = sources.filter((s) => s.health !== 'nokey' && s.health !== 'offline');
  const notSet = sources.filter((s) => s.health === 'nokey' || s.health === 'offline');
  const okCount = sources.filter((s) => s.health === 'ok').length;
  const conOn = cons.filter((c) => c.connected).length;

  return (
    <div className="wrap">
      <header className="bar">
        <div className="brand"><span className="mark" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} /><span className="wordmark">Assist<span className="ant">Ant</span></span></div>
        <div className="bar-right">
          <span className="mode-pill">{mode === 'notion' ? 'Notion' : 'Demo data'}</span>
          {install && <button className="install" type="button" onClick={async () => { install.prompt(); await install.userChoice; setInstall(null); }}>Install app</button>}
          <span className="date">{date}</span>
        </div>
      </header>
      {publicDemo && <p className="demo-banner">Public demo · fake Notion and Sheets data, free keyless models · your changes are private to you and reset when the server sleeps.</p>}

      <section className="head">
        <h1 className="wordmark">Assist<span className="ant">Ant</span></h1>
        <p className="sub">A personal agent that wraps up your day in Notion and plans tomorrow.</p>
      </section>

      <label className="ask-label" htmlFor="orderInput">Ask or give AssistAnt a task</label>
      <form className="ask" ref={askRef} autoComplete="off" onSubmit={(e) => { e.preventDefault(); openChat(task.trim() || null); }}>
        <span className="ask-prompt" aria-hidden="true">&gt;</span>
        <input id="orderInput" placeholder="what's due tomorrow?" spellCheck={false} value={task} onChange={(e) => setTask(e.target.value)} />
        <button id="send" type="submit" aria-label="Send"><span>send</span><kbd aria-hidden="true">{'↵'}</kbd></button>
      </form>
      <div className="tries">{SUGGEST.map((s) => <button key={s} type="button" onClick={() => openChat(s)}>{s}</button>)}</div>
      {error && <p className="err">{error}</p>}
      {chats.length > 0 && (
        <div className="recent">
          <span className="recent-h">Recent chats</span>
          {chats.slice(0, 4).map((c) => (
            <button key={c.id} type="button" className="recent-row" onClick={() => openChat(null, c.id)}>
              <span className="recent-t">{c.title}</span><span className="recent-m">{c.turns} {c.turns === 1 ? 'reply' : 'replies'} {'\u00b7'} {ago(c.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
      <Chat open={chatOpen} origin={chatOrigin} first={chatFirst} chatId={chatId} onClose={chatClosed} onRun={(id) => { attach(id); setView('live'); }} />

      <div className="tabs" role="tablist" aria-label="Views">
        <button className="tab" role="tab" type="button" aria-selected={view === 'meet'} onClick={() => setView('meet')}>Meet the crew</button>
        <button className="tab" role="tab" type="button" aria-selected={view === 'live'} onClick={() => setView('live')}><span className={'live-dot' + (running ? ' on' : '')} />Live</button>
        <button className="tab" role="tab" type="button" aria-selected={view === 'kb'} onClick={() => { setView('kb'); loadKb(); }}>Knowledge <span className="tab-count">{kb.length}</span></button>
        <button className="tab" role="tab" type="button" aria-selected={view === 'src'} onClick={() => { setView('src'); loadSources(); }}>Sources <span className="tab-count">{okCount}/{sources.length}</span></button>
        <button className="tab" role="tab" type="button" aria-selected={view === 'con'} onClick={() => setView('con')}>Connectors <span className="tab-count">{conOn}/{cons.length}</span></button>
      </div>

      <section role="tabpanel" hidden={view !== 'meet'}>
        <div className="meet">
          <article className="member lead">
            <div className="m-top"><div className="m-icon" dangerouslySetInnerHTML={{ __html: LOGO_SVG.replace('width="24" height="24"', 'width="32" height="32"') }} /><div><div className="m-name">Orchestrator</div></div></div>
            <p className="m-role">Reads what you asked, decides who on the crew does what, and in what order. Holds risky changes until you say OK.</p>
          </article>
          {AGENTS.map((a) => (
            <article className="member" key={a.id} title={ENG_LABEL[a.tier]}>
              <div className="m-top"><div className="m-icon"><Svg path={ICON[a.id]} /></div><div><div className="m-name">{a.name}</div></div></div>
              <p className="m-role">{a.role}</p>
            </article>
          ))}
        </div>
      </section>

      <section role="tabpanel" hidden={view !== 'live'}>
        <div className="floor-scroll">
          <div className="floor" ref={floorRef} aria-label="The crew at work">
            <span className="floor-label" style={{ top: 14 }}>The floor</span>
            <div className="bench-line" />
            <span className="floor-label" style={{ top: 548 }}>Bench</span>
            <svg id="wires" aria-hidden="true"><g id="edgeG" /></svg>
          </div>
        </div>
        <div className="lower">
          <section aria-label="Conversation">
            <h2>Conversation <small>{msgs.filter((m) => m.kind !== 'sys').length} messages</small></h2>
            <div className="convo" ref={convoRef} aria-live="polite">
              {!msgs.length && <span className="none">Messages between the crew show up here.</span>}
              {msgs.map((m, i) => (
                <div key={i} className={'msg ' + (m.kind || '')}>
                  <div className="msg-h"><b>{nameOf(m.from)}</b>{m.to && <><span>to</span><b>{nameOf(m.to)}</b></>}<span className="t">{m.at}</span></div>
                  <div className="msg-b">{m.text}</div>
                </div>
              ))}
            </div>
          </section>
          <div className="side">
            <section aria-label="Result">
              <h2>Result</h2>
              <TrayView tray={tray} decide={decide} submit={(id, v) => answer(id, v)} approveAll={() => { if (tray.kind === 'approve') { const a = tray.items.map(() => true); setTray({ ...tray, answers: a }); answer(tray.id, a); } }} />
            </section>
          </div>
        </div>
      </section>

      <section role="tabpanel" hidden={view !== 'src'}>
        <p className="src-lead">{okCount} of {sources.length} models ready. AssistAnt tries them top to bottom.</p>
        <ul className="mlist">
          {ready.map((s) => (
            <li key={s.id} className={'mrow' + (s.on ? '' : ' is-off')}>
              <span className={'dot s-' + (s.health === 'ok' ? 'ok' : s.health === 'full' ? 'full' : 'off')} />
              <div className="mmain">
                <div className="mname">{s.vendor} {s.name}</div>
                <div className={'mdetail' + (s.health === 'full' ? ' full' : '')}>
                  <span>{s.detail}</span>
                  {s.trains && <span className="warn-note">may log prompts</span>}
                  {s.sub && <span className="mini-step">limit <button type="button" aria-label="Lower the daily limit" onClick={() => patchSource({ budget: budget - 5 })}>{'−'}</button><b>{budget}</b><button type="button" aria-label="Raise the daily limit" onClick={() => patchSource({ budget: budget + 5 })}>+</button></span>}
                </div>
              </div>
              <button className="switch" type="button" role="switch" aria-checked={s.on} aria-label={`Use ${s.vendor} ${s.name}`} onClick={() => patchSource({ id: s.id, on: !s.on })} />
            </li>
          ))}
        </ul>
        {notSet.length > 0 && (
          <details className="notset">
            <summary className="src-h2">Not set up <span className="tab-count">{notSet.length}</span></summary>
            <ul className="mlist dim">
              {notSet.map((s) => (
                <li key={s.id} className="mrow">
                  <span className="dot" />
                  <div className="mmain"><div className="mname">{s.vendor} {s.name}</div><div className="mdetail"><span>{s.detail}</span>{s.trains && <span className="warn-note">may log prompts</span>}</div></div>
                  {s.keyUrl ? <a className="getkey" href={s.keyUrl} target="_blank" rel="noreferrer">Get key</a> : <span className="setup">{s.health === 'offline' ? 'Start it' : 'Add key'}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
        {listDate && <p className="list-credit">Free providers from <a href="https://github.com/mnfst/awesome-free-llm-apis" target="_blank" rel="noreferrer">awesome-free-llm-apis</a>, list dated {listDate}. Run <code>npm run update-models</code> to refresh it.</p>}
      </section>

      <section role="tabpanel" hidden={view !== 'kb'}>
        <p className="src-lead">{kb.length ? `${kb.length} note${kb.length > 1 ? 's' : ''} in your Knowledge Base. Ask about them from the box above.` : 'Add your notes here, then ask about them from the box above.'}</p>
        <div className="kb-actions">
          <label className={'drop' + (dragging ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
            <input type="file" multiple accept=".md,.markdown,.txt,.csv,.json,.html,.htm" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
            <span className="drop-t">Drop notes here, or click to choose files</span>
            <span className="drop-s">Markdown, text, CSV, JSON or HTML. A Notion export works too.</span>
          </label>
          <button type="button" className="sync" onClick={syncNotes}>Copy my Notion notes</button>
        </div>
        {kbNote && <p className="kb-note">{kbNote}</p>}
        {kb.length > 0 && (
          <ul className="mlist kb-list">
            {kb.map((d) => (
              <li key={d.id} className="mrow">
                <span className="kb-ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6M9 14h6M9 18h4" /></svg></span>
                <div className="mmain"><div className="mname">{d.title}</div><div className="mdetail"><span>{d.source === 'notion' ? 'From Notion' : d.source === 'paste' ? 'Pasted' : 'Uploaded'} {'\u00b7'} {d.parts} part{d.parts > 1 ? 's' : ''} {'\u00b7'} {ago(d.addedAt)}</span></div></div>
                <button type="button" className="kb-remove" aria-label={`Remove ${d.title}`} onClick={() => removeNote(d.id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section role="tabpanel" hidden={view !== 'con'}>
        <p className="src-lead">{conOn} of {cons.length} connected.{mode === 'demo' ? ' Running on demo data until Notion is connected.' : ''}</p>
        <div className="cgrid">
          {cons.map((c) => (
            <article key={c.id} className={'card2' + (c.connected ? ' on' : '')}>
              <div className="c2-top">
                <span className="clogo"><img src={`/logos/${c.id}.png`} alt="" /></span>
                {c.connected && <span className="c2-pill"><i />Connected</span>}
              </div>
              <div className="c2-body"><div className="mname">{c.name}</div><p className="c2-desc">{c.does}</p></div>
              {hint === c.id && <p className="setup-hint">{c.connected ? 'Remove its keys from .env.local to disconnect.' : c.setup}</p>}
              <button className="c2-btn" type="button" onClick={() => setHint(hint === c.id ? null : c.id)}>{c.connected ? 'Disconnect' : 'Connect'}</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function TrayView({ tray, decide, submit, approveAll }: { tray: Tray; decide: (i: number, v: boolean) => void; submit: (id: string, v: Record<string, string>) => void; approveAll: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  if (tray.kind === 'idle') return <div className="tray"><p className="none">Answers and approvals land here.</p></div>;
  if (tray.kind === 'working') return <div className="tray"><p className="none">Working on it{'…'}</p></div>;
  if (tray.kind === 'approve') return (
    <div className="tray wait">
      <p><strong>{tray.items.length > 1 ? `${tray.items.length} changes need` : 'One change needs'} your OK.</strong></p>
      {tray.items.map((it, i) => (
        <div className="ap" key={i}>
          <div>{it.title}<small>{it.why}</small></div>
          {tray.answers[i] === undefined
            ? <div className="btns"><button className="btn yes" type="button" onClick={() => decide(i, true)}>Approve</button><button className="btn" type="button" onClick={() => decide(i, false)}>Skip</button></div>
            : <span className={'pill' + (tray.answers[i] ? ' ok' : '')}>{tray.answers[i] ? 'Approved' : 'Skipped'}</span>}
        </div>
      ))}
      {tray.items.length > 1 && tray.answers.some((a) => a === undefined) && <div><button className="btn" type="button" onClick={approveAll}>Approve all</button></div>}
    </div>
  );
  if (tray.kind === 'form') return (
    <form className="tray wait" onSubmit={(e) => { e.preventDefault(); submit(tray.id, form); }}>
      <p><strong>{tray.title}</strong></p>
      {tray.fields.map((f) => (
        <div className="form-row" key={f.key}><label htmlFor={'f-' + f.key}>{f.label}</label><input id={'f-' + f.key} placeholder={f.placeholder} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} /></div>
      ))}
      <div><button className="btn yes" type="submit">Log it</button></div>
    </form>
  );
  return (
    <div className="tray">
      <p className="say">{tray.say}</p>
      {tray.rows && tray.rows.length > 0 && <div>{tray.rows.map((r, i) => <div className="rrow" key={i}><span>{r[0]}</span><span>{r[1]}</span></div>)}</div>}
      {tray.note && <p className="s-muted" style={{ fontSize: 13 }}>{tray.note}</p>}
    </div>
  );
}
