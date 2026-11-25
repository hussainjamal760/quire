import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { personStyle } from '../lib/people';

interface Toast {
  id: number;
  message: string;
  /** Colors the toast with this person's highlighter. */
  person?: string;
  tone?: 'info' | 'error';
}

type Notify = (message: string, options?: Omit<Toast, 'id' | 'message'>) => void;

const ToastContext = createContext<Notify>(() => undefined);

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const notify = useCallback<Notify>((message, options = {}) => {
    const id = nextId.current++;
    // Replace a toast with the same text instead of stacking duplicates.
    setToasts((current) => [...current.filter((t) => t.message !== message), { id, message, ...options }].slice(-3));
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.tone ?? 'info'}`}
            style={toast.person ? personStyle(toast.person) : undefined}
          >
            {toast.person && <span className="toast-swatch" aria-hidden="true" />}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
