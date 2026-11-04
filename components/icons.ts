// The AssistAnt mascot: a friendly ant, seen from the side (three round segments, like the old three-dot mark).
export const LOGO_SVG = '<svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><g transform="translate(0 2)"><g stroke="#E5791A" stroke-width="1.5" stroke-linecap="round" fill="none"><path d="M21.4 9.6 Q20.6 6.6 18.6 5.2"/><path d="M23.8 9.4 Q25.2 6.4 27.4 5.6"/><path d="M14.6 19.2 L12.2 23.2"/><path d="M16.2 20 L16.4 24.2"/><path d="M17.8 19.2 L20.4 23"/></g><g fill="#E5791A"><circle cx="18.3" cy="4.9" r="1.45"/><circle cx="27.7" cy="5.4" r="1.45"/><ellipse cx="8.6" cy="16.6" rx="6.2" ry="5.4"/><circle cx="16.2" cy="17.4" r="2.9"/><circle cx="23" cy="14.2" r="5.4"/></g><ellipse cx="6.6" cy="13.9" rx="2.2" ry="1.3" fill="#FFFFFF" opacity=".28" transform="rotate(-20 6.6 13.9)"/><ellipse cx="24.9" cy="13.1" rx="1.45" ry="1.85" fill="#1B1B1A"/><circle cx="25.4" cy="12.4" r=".55" fill="#FFFFFF"/><ellipse cx="26.3" cy="16.4" rx="1.2" ry=".75" fill="#F6A07E"/><path d="M23.4 16.6 Q24.4 17.9 25.6 17.2" stroke="#1B1B1A" stroke-width=".8" stroke-linecap="round" fill="none"/></g></svg>';

export const ICON: Record<string, string> = {
  reader: '<path d="M3 6.5c3-1 6-1 9 1 3-2 6-2 9-1V18c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 7.5V19"/>',
  summarizer: '<path d="M5 7h14M5 11h14M5 15h9M5 19h6"/>',
  matcher: '<path d="M10.5 13.5a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-1 1"/><path d="M13.5 10.5a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 0 1-5-5l1-1"/>',
  scout: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>',
  chores: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5M19.5 12a7.5 7.5 0 0 1-13 5"/><path d="M18 3.5V7h-3.5M6 20.5V17h3.5"/>',
  planner: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  writer: '<path d="M4 20l1.2-4.2L16 5l3 3L8.2 18.8z"/><path d="M14 7l3 3"/>',
  checker: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.3l2.4 2.4 4.6-5"/>',
  grocer: '<path d="M4 9h16l-2 10H6z"/><path d="M9 9l3-5 3 5"/>',
  briefer: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/>',
  clerk: '<path d="M4 19.5h16"/><path d="M5.5 15.5l4-4 3 3 6-6"/><path d="M15 8.5h3.5V12"/>',
};

export const ENG_LABEL: Record<string, string> = { code: 'plain code', fast: 'fast models', smart: 'smart models', best: 'claude · your plan' };
