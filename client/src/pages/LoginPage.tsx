import { useState, type FormEvent } from 'react';
import { api, type User } from '../api';
import { Avatar } from '../components/Avatar';
import { Wordmark } from '../components/Wordmark';
import { LoginScene } from '../components/LoginScene';

// Mirrors the seeded accounts in server/src/db.ts.
const DEMO_ACCOUNTS = [
  { email: 'alice@ajaia.dev', name: 'Alice Moreno', note: 'Owns the launch plan' },
  { email: 'bob@ajaia.dev', name: 'Bob Okafor', note: 'Can edit it' },
  { email: 'carol@ajaia.dev', name: 'Carol Singh', note: 'Can only view it' },
];
const DEMO_PASSWORD = 'quire-demo';

export function LoginPage({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function signIn(emailToUse: string, passwordToUse: string) {
    setBusy(emailToUse);
    setError(null);
    try {
      onSignedIn(await api.login(emailToUse, passwordToUse));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    void signIn(email.trim(), password);
  }

  return (
    <main className="login">
      <section className="login-panel">
        <Wordmark />

        <div className="login-copy">
          <h1>
            <span>Write it once.</span> <span>Work on it together.</span>
          </h1>
          <p>Quire is where your team drafts, imports and shares documents, and sees who else is in them.</p>
        </div>

        <div className="demo">
          <h2>Pick a demo account</h2>
          <ul className="demo-list">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  className="demo-account"
                  disabled={busy !== null}
                  onClick={() => signIn(account.email, DEMO_PASSWORD)}
                >
                  <Avatar name={account.name} />
                  <span className="demo-text">
                    <strong>{account.name}</strong>
                    <span>{account.note}</span>
                  </span>
                  <span className="demo-go">{busy === account.email ? 'Signing in…' : 'Sign in'}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="demo-hint">Try Alice in one window and Bob in a private one to watch edits arrive live.</p>
        </div>

        <details className="login-manual">
          <summary>Sign in with email and password</summary>
          <form onSubmit={onSubmit} noValidate>
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <p className="field-hint">
              Demo password: <code>{DEMO_PASSWORD}</code>
            </p>
            <button className="button button-ink" type="submit" disabled={busy !== null}>
              Sign in
            </button>
          </form>
        </details>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <LoginScene />
    </main>
  );
}
