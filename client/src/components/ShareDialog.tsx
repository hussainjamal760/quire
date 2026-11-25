import { useEffect, useState, type FormEvent } from 'react';
import { api, type Share, type ShareRole } from '../api';
import { Avatar } from './Avatar';
import { Modal } from './Modal';

interface Props {
  documentId: string;
  documentTitle: string;
  ownerName: string;
  onClose: () => void;
}

export function ShareDialog({ documentId, documentTitle, ownerName, onClose }: Props) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('editor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listShares(documentId).then(setShares, (err: Error) => setError(err.message));
  }, [documentId]);

  async function run(action: () => Promise<Share[]>) {
    setBusy(true);
    setError(null);
    try {
      setShares(await action());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    if (await run(() => api.share(documentId, email.trim(), role))) setEmail('');
  }

  return (
    <Modal title={`Share “${documentTitle}”`} onClose={onClose} className="share">
      {(close) => (
        <>
          <form className="share-form" onSubmit={onInvite}>
            <input
              type="email"
              placeholder="Add people by email"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <select aria-label="Access" value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button className="button button-ink" type="submit" disabled={busy || !email.trim()}>
              Share
            </button>
          </form>
          <p className="share-hint">
            Try <code>bob@ajaia.dev</code> or <code>carol@ajaia.dev</code>.
          </p>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <h3 className="share-heading">People with access</h3>
          <ul className="share-list">
            <li>
              <Avatar name={ownerName} />
              <span className="share-person">
                <strong>{ownerName} (you)</strong>
              </span>
              <span className="share-owner">Owner</span>
            </li>
            {shares?.map(({ user, role: current }) => (
              <li key={user.id} className="share-row">
                <Avatar name={user.name} />
                <span className="share-person">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </span>
                <span className="share-controls">
                  <select
                    aria-label={`Access for ${user.name}`}
                    value={current}
                    disabled={busy}
                    onChange={(e) => run(() => api.share(documentId, user.email, e.target.value as ShareRole))}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button
                    className="button button-quiet"
                    disabled={busy}
                    onClick={() => run(() => api.revoke(documentId, user.id))}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {shares?.length === 0 && <p className="share-empty">Only you can open this document right now.</p>}

          <div className="modal-footer">
            <button className="button" onClick={close}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
