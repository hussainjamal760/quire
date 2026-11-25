import type { CSSProperties } from 'react';
import { firstName, personStyle } from '../lib/people';

const delay = (seconds: number) => ({ '--d': `${seconds}s` }) as CSSProperties;

const people = { alice: 'Alice Moreno', bob: 'Bob Okafor', carol: 'Carol Singh' };

/** A collaborator's caret with a name flag, sitting inline where they're working. */
function Cursor({ name, at }: { name: string; at: number }) {
  return (
    <span className="scene-cursor" style={{ ...personStyle(name), ...delay(at) }}>
      <span>{firstName(name)}</span>
    </span>
  );
}

/**
 * The one orchestrated moment in the app: a document writes itself while two
 * collaborators show up, one highlighting a line and one adding to the list.
 * Pure CSS; under prefers-reduced-motion it renders the finished state.
 */
export function LoginScene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-sheet scene-sheet-back" />
      <div className="scene-sheet scene-sheet-mid" />

      <div className="scene-sheet scene-sheet-front">
        <div className="scene-presence">
          {Object.values(people).map((name, i) => (
            <span key={name} className="scene-avatar" style={{ ...personStyle(name), ...delay(0.6 + i * 1.1) }}>
              {name[0]}
            </span>
          ))}
        </div>

        <p className="scene-h1 type" style={delay(0.4)}>
          Q1 launch plan
        </p>
        <p className="scene-p type" style={delay(1.2)}>
          Ship the beta to two internal teams,
        </p>
        <p className="scene-p">
          <span className="type" style={delay(1.8)}>
            then collect{' '}
            <mark className="scene-mark" style={{ ...personStyle(people.bob), ...delay(3.2) }}>
              written feedback before March
            </mark>
          </span>
          <Cursor name={people.bob} at={2.6} />
        </p>

        <p className="scene-h2 type" style={delay(2.5)}>
          Open questions
        </p>
        <ol className="scene-list">
          <li>
            <span className="type" style={delay(2.9)}>
              Who owns the onboarding docs?
            </span>
          </li>
          <li className="scene-carol" style={personStyle(people.carol)}>
            <span className="type type-carol" style={delay(4.4)}>
              Is email login enough for beta?
            </span>
            <Cursor name={people.carol} at={3.9} />
          </li>
        </ol>

        <span className="scene-saved" style={delay(6.2)}>
          Saved
        </span>
      </div>
    </div>
  );
}
