import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Two screens don't justify a router dependency. This covers what we need:
 * navigation, back/forward, one dynamic segment, and view transitions.
 *
 * The normal build routes on the path (/d/:id). The static demo build is
 * hosted where only a plain #name survives in the URL, so it routes on
 * #doc-<id> instead. Callers only ever see paths.
 */
export type Route = { name: 'home' } | { name: 'document'; id: string };

const HASH_ROUTES = import.meta.env.VITE_DEMO;
const NAVIGATED = 'quire:navigated';

function currentPath(): string {
  if (!HASH_ROUTES) return window.location.pathname;
  const match = window.location.hash.match(/^#doc-([\w-]+)$/);
  return match ? `/d/${match[1]}` : '/';
}

function parse(path: string): Route {
  const match = path.match(/^\/d\/([\w-]+)\/?$/);
  return match ? { name: 'document', id: match[1]! } : { name: 'home' };
}

/** The href for a document link, in whichever form this build routes on. */
export function docHref(id: string) {
  return HASH_ROUTES ? `#doc-${id}` : `/d/${id}`;
}

function go(path: string) {
  if (path === currentPath()) return;
  if (HASH_ROUTES) {
    const match = path.match(/^\/d\/([\w-]+)/);
    window.location.hash = match ? `doc-${match[1]}` : '';
  } else {
    window.history.pushState(null, '', path);
  }
  // Tell useRoute synchronously, so a surrounding flushSync renders the new screen.
  window.dispatchEvent(new Event(NAVIGATED));
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Navigates inside a view transition where the browser supports it, so
 * elements sharing a view-transition-name (a thumbnail and its page) morph.
 */
export function navigate(path: string, { transition = true } = {}) {
  if (!transition || !document.startViewTransition || reducedMotion()) return go(path);
  const vt = document.startViewTransition(() => flushSync(() => go(path)));
  // A second navigation before the first finishes skips the animation; that's fine, not an error.
  vt.ready.catch(() => undefined);
  vt.finished.catch(() => undefined);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(currentPath()));

  useEffect(() => {
    const onChange = () => setRoute(parse(currentPath()));
    const events = [NAVIGATED, HASH_ROUTES ? 'hashchange' : 'popstate'];
    events.forEach((name) => window.addEventListener(name, onChange));
    return () => events.forEach((name) => window.removeEventListener(name, onChange));
  }, []);

  return route;
}
