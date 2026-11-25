import { useEffect, useRef, useState } from 'react';
import { openChannel, type LiveDocument } from '../api';

export interface Present {
  id: string;
  name: string;
}

interface Handlers {
  onSaved: (doc: LiveDocument) => void;
  onGone: (reason: 'access-revoked' | 'deleted') => void;
}

/** Subscribes to the document's live channel: who else is here, and saves as they happen. */
export function useDocumentChannel(documentId: string, handlers: Handlers) {
  const [present, setPresent] = useState<Present[]>([]);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(
    () =>
      openChannel(documentId, {
        onPresence: setPresent,
        onConnection: setConnected,
        onSaved: (doc) => handlersRef.current.onSaved(doc),
        onGone: (reason) => handlersRef.current.onGone(reason),
      }),
    [documentId],
  );

  return { present, connected };
}
