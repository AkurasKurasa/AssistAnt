'use client';

import { useEffect, useState } from 'react';
import { LOGO_SVG } from './icons';

// The tour's opening scene, on why AssistAnt exists: the scattered pieces of a day
// get picked up and carried by the ant. Three beats, then it rests on the last one.
const ITEMS = ['Tasks', 'Reminders', 'Notes', 'Groceries', 'Expenses', 'Deadlines'];
const SCATTER: [number, number, number][] = [[5, 10, -8], [60, 6, 6], [30, 36, -5], [72, 42, 9], [8, 64, 5], [50, 70, -7]]; // left %, top %, degrees
const TILT = [-2, 1, -1, 2, -1, 1];
const LINES = [
  'A day is scattered: tasks, reminders, notes, bills, groceries, deadlines.',
  'An assistant that knows you can pick all of it up and sort it out.',
  'AssistAnt started as one person’s assistant. This demo shows how it could work for anyone.',
];
const ANT = LOGO_SVG.replace('width="24" height="24"', 'width="76" height="76"');

export default function TourHook() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setPhase(2); return; }
    const a = setTimeout(() => setPhase(1), 2200);
    const b = setTimeout(() => setPhase(2), 4600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  return (
    <div className="hook" data-phase={phase}>
      <div className="hook-stage" aria-hidden="true">
        {ITEMS.map((t, i) => {
          const [left, top, deg] = SCATTER[i];
          // Scattered across the stage, then sorted into a tidy 3 × 2 grid above the ant.
          const style = phase === 0
            ? { left: `${left}%`, top: `${top}%`, transform: `rotate(${deg}deg)` }
            : { left: `${[20, 50, 80][i % 3]}%`, top: `${i < 3 ? 12 : 48}px`, transform: `translateX(-50%) rotate(${TILT[i]}deg)`, transitionDelay: `${i * 70}ms` };
          return (
            <span key={t} className="hook-chip" style={style}>
              <span style={{ animationDelay: `${i * -0.4}s` }}><i />{t}</span>
            </span>
          );
        })}
        <span className={'hook-ant' + (phase === 1 ? ' walking' : '')} style={{ left: phase === 0 ? '-22%' : '50%' }} dangerouslySetInnerHTML={{ __html: ANT }} />
      </div>
      <p className="hook-line" key={phase} aria-live="polite">{LINES[phase]}</p>
      <div className="hook-beats" aria-hidden="true">{LINES.map((_, i) => <span key={i} className={i <= phase ? 'on' : ''} />)}</div>
    </div>
  );
}
