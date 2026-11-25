/** A folded sheet with one highlighted line, then the name. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="wordmark">
      <svg className="wordmark-mark" viewBox="0 0 24 28" aria-hidden="true">
        <path d="M3 2h13l5 5v18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="var(--ink)" />
        <path d="M16 2v4a1 1 0 0 0 1 1h4" fill="none" stroke="var(--blotter)" strokeWidth="1.4" />
        <rect x="5.5" y="11" width="12" height="3.2" rx="1" fill="#ffe45c" />
        <rect x="5.5" y="17" width="9" height="1.6" rx=".8" fill="#fff" />
        <rect x="5.5" y="21" width="11" height="1.6" rx=".8" fill="#fff" opacity=".55" />
      </svg>
      {!compact && <span className="wordmark-name">Quire</span>}
    </span>
  );
}
