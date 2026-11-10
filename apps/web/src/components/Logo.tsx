/** TriCoach mark: swim / bike / run ring around the triathlon triangle. Uses discipline colour tokens. */
export default function Logo({ size = 24, title }: { size?: number; title?: string }) {
  const seg = { fill: 'none', strokeWidth: 9, strokeLinecap: 'round' as const, strokeDasharray: '38 112.8' };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <g transform="rotate(-90 32 32)">
        <circle cx="32" cy="32" r="24" style={{ ...seg, stroke: 'var(--swim)', strokeDashoffset: -6 }} />
        <circle cx="32" cy="32" r="24" style={{ ...seg, stroke: 'var(--bike)', strokeDashoffset: -56.3 }} />
        <circle cx="32" cy="32" r="24" style={{ ...seg, stroke: 'var(--run)',  strokeDashoffset: -106.5 }} />
      </g>
      <path d="M32 19 L44 40 H20 Z" style={{ fill: 'var(--tri)', stroke: 'var(--tri)', strokeWidth: 3, strokeLinejoin: 'round' }} />
    </svg>
  );
}
