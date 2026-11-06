'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import TourHook from './TourHook';

// First-visit guided tour: dims the page, spotlights one part at a time and explains it.
// Steps point at elements marked data-tour="…" in App.tsx; a step without a target is centred.
export type TourView = 'meet' | 'live' | 'kb' | 'src' | 'con';
interface Step { target?: string; view?: TourView; title: string; body: string; hook?: boolean } // hook: the animated opening scene

const STEPS: Step[] = [
  { hook: true, title: 'Why AssistAnt exists', body: 'Everything here runs on a fictional person’s sample data, so try anything. The tour takes about a minute.' },
  { target: 'ask', title: 'Ask or give a task', body: 'Type in plain words. Questions are answered from the notes, with sources. Tasks like “add eggs to groceries” go to the crew.' },
  { target: 'tries', title: 'Not sure what to type?', body: 'These shortcuts run real routines on the sample data, start to finish.' },
  { target: 'panel-meet', view: 'meet', title: 'Meet the crew', body: 'An Orchestrator and eleven specialists. A few use AI models; most are plain code, so they’re instant and free.' },
  { target: 'panel-live', view: 'live', title: 'Watch them work', body: 'When a task runs, the agents walk onto the floor and pass messages to each other. Anything risky waits here for your OK.' },
  { target: 'panel-kb', view: 'kb', title: 'Knowledge', body: 'Upload or paste notes. Chat answers quote them as numbered sources, so you can check every claim.' },
  { target: 'panel-src', view: 'src', title: 'Sources', body: 'The AI models AssistAnt can use, tried top to bottom. If one is busy or out of quota, it moves on. If none answer, it falls back to plain rules.' },
  { target: 'panel-con', view: 'con', title: 'Connectors', body: 'In this demo, Notion and Google Sheets are connected to fake sample data. Nothing here touches a real account.' },
  { title: 'Try it', body: 'See the crew put together a morning brief from the sample data.' },
];

const STORE_KEY = 'assistant-tour-v1';
const GAP = 12;   // space between spotlight and card
const PAD = 8;    // spotlight padding around the target

// The tour starts every time the showcase is opened (each new tab or window), but not again on a
// reload in the same tab once it was finished or skipped. ?tour=1 always starts it.
export function tourSeen(): boolean {
  try {
    if (new URLSearchParams(location.search).has('tour')) return false;
    return sessionStorage.getItem(STORE_KEY) === 'done';
  } catch { return false; } // no storage: show it
}
function markSeen() {
  try { sessionStorage.setItem(STORE_KEY, 'done'); } catch { /* private mode: fine */ }
}

interface Box { top: number; left: number; width: number; height: number }

export default function Tour({ open, onClose, onView, onTry }: { open: boolean; onClose: () => void; onView: (v: TourView) => void; onTry: () => void }) {
  const [i, setI] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [card, setCard] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const close = useCallback((done = true) => { if (done) markSeen(); onClose(); setI(0); }, [onClose]);

  // Place the spotlight and the card. The card goes below the target, else above, else the
  // spotlight is trimmed so the card fits underneath (tall panels like the crew grid).
  const place = useCallback(() => {
    // Visible area, not the layout width: an overflowing page must not push the card off screen.
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const ch = cardRef.current?.offsetHeight ?? 200, cw = Math.min(step.hook ? 460 : 380, vw - 32);
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    if (!el) { setSpot(null); setCard({ top: Math.max(16, (vh - ch) / 2), left: (vw - cw) / 2 }); return; }
    const r = el.getBoundingClientRect();
    let box: Box = { top: r.top - PAD, left: Math.max(8, r.left - PAD), width: Math.min(r.width + PAD * 2, vw - 16), height: r.height + PAD * 2 };
    let top: number;
    if (box.top + box.height + GAP + ch <= vh - 16) top = box.top + box.height + GAP;
    else if (box.top - GAP - ch >= 16) top = box.top - GAP - ch;
    else { box = { ...box, height: Math.max(80, vh - 16 - ch - GAP - box.top) }; top = box.top + box.height + GAP; }
    setSpot(box);
    setCard({ top, left: Math.min(Math.max(16, r.left), vw - cw - 16) });
  }, [step]);

  // On each step: switch to its view, bring the target near the top, then measure.
  useLayoutEffect(() => {
    if (!open) return;
    if (step.view) onView(step.view);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const raf = requestAnimationFrame(() => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
      if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 96), behavior: smooth ? 'smooth' : 'auto' });
      place();
      setTimeout(place, smooth ? 420 : 0); // after the smooth scroll settles
    });
    return () => cancelAnimationFrame(raf);
  }, [open, i, step, onView, place]);

  // Focus the main button once the card is placed (a hidden card can't take focus).
  const placed = card !== null;
  useEffect(() => { if (open && placed) primaryRef.current?.focus({ preventScroll: true }); }, [open, i, placed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' && !last) setI((n) => n + 1);
      else if (e.key === 'ArrowLeft' && i > 0) setI((n) => n - 1);
      else if (e.key === 'Tab') { // keep focus inside the card
        const f = cardRef.current?.querySelectorAll<HTMLElement>('button');
        if (!f?.length) return;
        const first = f[0], end = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
        else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', place); window.removeEventListener('scroll', place); };
  }, [open, i, last, close, place]);

  if (!open) return null;
  return (
    <div className="tour" aria-live="polite">
      <div className="tour-catch" />
      {spot ? <div className="tour-spot" style={spot} /> : <div className="tour-dim" />}
      <div className={'tour-card' + (step.hook ? ' has-hook' : '')} ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        style={card ? { top: card.top, left: card.left } : { visibility: 'hidden' }}>
        <div className="tour-count">{i + 1} of {STEPS.length}</div>
        <h2 id="tour-title" className="tour-title">{step.title}</h2>
        {step.hook && <TourHook />}
        <p id="tour-body" className="tour-body">{step.body}</p>
        <div className="tour-actions">
          {last ? (
            <>
              <button type="button" className="tour-link" onClick={() => close()}>Explore on my own</button>
              <button type="button" className="tour-primary" ref={primaryRef} onClick={() => { close(); onTry(); }}>Run the morning brief</button>
            </>
          ) : (
            <>
              <button type="button" className="tour-link" onClick={() => close()}>Skip tour</button>
              <span className="tour-nav">
                {i > 0 && <button type="button" className="tour-back" onClick={() => setI(i - 1)}>Back</button>}
                <button type="button" className="tour-primary" ref={primaryRef} onClick={() => setI(i + 1)}>{i === 0 ? 'Start the tour' : 'Next'}</button>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
