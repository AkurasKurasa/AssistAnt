'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Full-screen chat that grows out of the home input. Answers roll in like credits:
// the newest one zooms into place while older ones shrink and drift up.

interface Source { n: number; title: string; snippet: string }
export interface Turn { q: string; steps: string[]; answer: string; sources: Source[]; model?: string; run?: { id: string; title: string }; pending?: boolean }

interface Props {
  open: boolean;
  origin: DOMRect | null;        // where the home input sits, so the window can grow from it
  first: string | null;          // the message typed on the home page
  chatId: string | null;         // reopen a saved chat
  onClose: (saved: boolean) => void;
  onRun: (runId: string) => void;
}

export default function Chat({ open, origin, first, chatId, onClose, onRun }: Props) {
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open' | 'closing'>('closed');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<number | null>(null); // which past answer's steps are expanded
  const inputRef = useRef<HTMLInputElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);
  const sentFirst = useRef(false);
  const idRef = useRef<string | null>(null);

  // Grow from the input box to the full window.
  useLayoutEffect(() => {
    if (!open) return;
    setPhase('opening');
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open')));
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    sentFirst.current = false;
    setTurns([]); setId(chatId); idRef.current = chatId; setTitle(''); setText(''); setShown(null);
    if (chatId) {
      fetch(`/api/chats/${chatId}`).then((r) => r.json()).then((c) => { if (c.turns) { setTurns(c.turns); setTitle(c.title); } });
    }
  }, [open, chatId]);

  useEffect(() => {
    if (phase === 'open') {
      inputRef.current?.focus();
      if (first && !sentFirst.current) { sentFirst.current = true; send(first); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    const el = rollRef.current; if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const close = useCallback(() => {
    if (busy) return;
    setPhase('closing');
    setTimeout(() => { setPhase('closed'); onClose(turns.length > 0); }, 420);
  }, [busy, onClose, turns.length]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, close]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true); setText(''); setShown(null);
    if (!title) setTitle(m.slice(0, 70));
    setTurns((t) => [...t, { q: m, steps: [], answer: '', sources: [], pending: true }]);
    const patch = (fn: (t: Turn) => Turn) => setTurns((all) => all.map((t, i) => (i === all.length - 1 ? fn(t) : t)));
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: m, chatId: idRef.current }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || 'Couldn’t send that.');
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.t === 'chat') { idRef.current = e.id; setId(e.id); }
          else if (e.t === 'step') patch((t) => ({ ...t, steps: [...t.steps, e.text] }));
          else if (e.t === 'sources') patch((t) => ({ ...t, sources: e.items }));
          else if (e.t === 'answer') patch((t) => ({ ...t, answer: e.text, model: e.model, pending: false }));
          else if (e.t === 'run') { patch((t) => ({ ...t, run: { id: e.id, title: e.title } })); }
        }
      }
    } catch (err: any) {
      patch((t) => ({ ...t, answer: err.message || 'Something went wrong.', pending: false }));
    }
    setBusy(false);
    inputRef.current?.focus();
  }

  if (phase === 'closed' && !open) return null;

  const r = origin;
  const clip = phase === 'open'
    ? 'inset(0px round 0px)'
    : r ? `inset(${r.top}px ${Math.max(0, window.innerWidth - r.right)}px ${Math.max(0, window.innerHeight - r.bottom)}px ${r.left}px round 16px)` : 'inset(40% 20% 40% 20% round 16px)';

  return (
    <div className={'chatx ' + phase} style={{ clipPath: clip }} role="dialog" aria-modal="true" aria-label="Chat with AssistAnt">
      <header className="chatx-bar">
        <button className="chatx-return" type="button" onClick={close} disabled={busy}>
          <kbd aria-hidden="true">{'↵'}</kbd> Return
        </button>
        <span className="chatx-title">{title || 'New chat'}</span>
        <span className="chatx-saved">{id && turns.length ? 'Saved' : ''}</span>
      </header>

      <div className="chatx-roll" ref={rollRef}>
        <div className="chatx-col">
          <div className="chatx-spacer" />
          {turns.map((t, i) => {
            const last = i === turns.length - 1;
            const open = last || shown === i;
            return (
              <article key={i} className={'credit' + (last ? ' current' : ' past')} onClick={() => !last && setShown(shown === i ? null : i)}>
                <p className="credit-q"><span aria-hidden="true">&gt;</span> {t.q}</p>
                {open && t.steps.length > 0 && (
                  <ol className="credit-steps" aria-label="How AssistAnt worked it out">
                    {t.steps.map((s, k) => <li key={k} style={{ animationDelay: `${k * 60}ms` }}>{s}</li>)}
                    {t.pending && <li className="thinking">thinking<span className="dots"><i /><i /><i /></span></li>}
                  </ol>
                )}
                {t.pending && !t.steps.length && <ol className="credit-steps"><li className="thinking">thinking<span className="dots"><i /><i /><i /></span></li></ol>}
                {t.answer && (
                  <p className="credit-a">
                    {t.answer.split(/(\s+)/).map((w, k) => <span key={k} style={last ? { animationDelay: `${Math.min(k, 160) * 14}ms` } : undefined}>{w}</span>)}
                  </p>
                )}
                {t.run && (
                  <button className="credit-run" type="button" onClick={(e) => { e.stopPropagation(); onRun(t.run!.id); setPhase('closing'); setTimeout(() => { setPhase('closed'); onClose(true); }, 420); }}>
                    Watch the crew {'→'}
                  </button>
                )}
                {t.answer && t.sources.length > 0 && (
                  <p className="credit-src">
                    {t.sources.slice(0, 5).map((s) => <span key={s.n} title={s.snippet}>[{s.n}] {s.title}</span>)}
                  </p>
                )}
                {t.answer && t.model && <p className="credit-model">{t.model}</p>}
              </article>
            );
          })}
          {!turns.length && <p className="credit-empty">Ask about your notes, or give the crew a task.</p>}
        </div>
      </div>

      <form className="chatx-ask" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) close(); else send(text); }}>
        <span className="ask-prompt" aria-hidden="true">&gt;</span>
        <label htmlFor="chatInput" className="sr">Message</label>
        <input id="chatInput" ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={turns.length ? 'ask a follow-up, or press return to go back' : 'ask anything'} spellCheck={false} autoComplete="off" />
        <button type="submit" disabled={busy} aria-label={text.trim() ? 'Send' : 'Return home'}><span>{text.trim() ? 'send' : 'return'}</span><kbd aria-hidden="true">{'↵'}</kbd></button>
      </form>
    </div>
  );
}
