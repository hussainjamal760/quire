import type { User } from '../api';
import type { Present } from '../hooks/useDocumentChannel';
import { firstName, personStyle } from '../lib/people';
import { Avatar } from './Avatar';

/** Who else has the document open. People who saved in the last few seconds get a pulsing ring. */
export function Presence({ present, me, activeIds }: { present: Present[]; me: User; activeIds: Set<string> }) {
  const others = present.filter((person) => person.id !== me.id);
  if (others.length === 0) return null;

  const label =
    others.length === 1
      ? `${firstName(others[0]!.name)} is here`
      : `${others.map((p) => firstName(p.name)).join(', ')} are here`;

  return (
    <div className="presence" aria-label={label} role="group">
      {others.slice(0, 4).map((person) => (
        <span
          key={person.id}
          className={`presence-person${activeIds.has(person.id) ? ' is-active' : ''}`}
          style={personStyle(person.name)}
        >
          <Avatar name={person.name} label={`${person.name}${activeIds.has(person.id) ? ', editing' : ', viewing'}`} />
        </span>
      ))}
      {others.length > 4 && <span className="presence-more">+{others.length - 4}</span>}
    </div>
  );
}
