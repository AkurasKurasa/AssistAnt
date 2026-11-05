// The loading animation: the AssistAnt mascot walking, legs stepping in alternating pairs,
// antennae bobbing, a dotted trail scrolling underneath. Still for reduced motion.
export default function AntLoader({ size = 64, label }: { size?: number; label?: string }) {
  return (
    <span className="ant-loader" role="status" aria-label={label || 'Working'}>
      <svg width={size} height={size * 0.66} viewBox="0 0 64 42" aria-hidden="true">
        <line className="al-trail" x1="0" y1="39" x2="64" y2="39" />
        <g className="al-walk">
          <g stroke="#E5791A" strokeWidth="2.2" strokeLinecap="round" fill="none">
            <path className="al-leg a" d="M31 26 L26 36" />
            <path className="al-leg b" d="M34 27 L34 37" />
            <path className="al-leg a" d="M37 26 L42 36" />
            <path className="al-ant-l" d="M43 9 Q41 4 37 2.8" />
            <path className="al-ant-r" d="M48 8.5 Q51 3.5 55 3" />
          </g>
          <g fill="#E5791A">
            <circle cx="36.6" cy="2.6" r="2.2" /><circle cx="55.6" cy="3" r="2.2" />
            <ellipse cx="16" cy="22" rx="11" ry="9" />
            <circle cx="29" cy="23" r="3" />
            <circle cx="34" cy="22" r="5" />
            <circle cx="46" cy="17" r="9" />
          </g>
          <ellipse cx="12.5" cy="17.5" rx="4" ry="2.3" fill="#FFF" opacity=".28" transform="rotate(-20 12.5 17.5)" />
          <ellipse cx="49" cy="15.5" rx="2.4" ry="3" fill="#1B1B1A" />
          <circle cx="50" cy="14.3" r=".9" fill="#FFF" />
          <ellipse cx="51.6" cy="20" rx="2" ry="1.2" fill="#F6A07E" />
          <path d="M45.5 20.5 Q47.5 22.6 49.6 21.3" stroke="#1B1B1A" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </g>
      </svg>
      {label && <span className="ant-loader-label">{label}</span>}
    </span>
  );
}
