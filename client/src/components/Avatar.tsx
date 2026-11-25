import { initials, personStyle } from '../lib/people';

export function Avatar({
  name,
  size = 'md',
  label,
}: {
  name: string;
  size?: 'sm' | 'md';
  /** Accessible name when the avatar stands alone (otherwise it's decorative). */
  label?: string;
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={personStyle(name)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label ?? name}
    >
      {initials(name)}
    </span>
  );
}
