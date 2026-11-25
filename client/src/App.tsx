import { lazy, Suspense, useEffect, useState } from 'react';
import { api, type User } from './api';
import { navigate, useRoute } from './lib/router';
import { loadEditorChunk } from './lib/cache';
import { ToastProvider } from './components/Toast';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';

// The editor pulls in ProseMirror; no need to ship it with the login screen.
const EditorPage = lazy(() =>
  loadEditorChunk().then((m) => ({ default: (m as typeof import('./pages/EditorPage')).EditorPage })),
);

export function App() {
  // undefined = still checking the session cookie
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const route = useRoute();

  useEffect(() => {
    api.me().then(setUser, () => setUser(null));
  }, []);

  if (user === undefined) return <div className="boot" aria-busy="true" />;

  const signOut = async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    navigate('/', { transition: false });
  };

  return (
    <ToastProvider>
      {user === null ? (
        <LoginPage onSignedIn={setUser} />
      ) : route.name === 'document' ? (
        <Suspense fallback={<main className="editor-loading">Opening document…</main>}>
          <EditorPage key={route.id} id={route.id} user={user} />
        </Suspense>
      ) : (
        <HomePage user={user} onSignOut={signOut} />
      )}
    </ToastProvider>
  );
}
