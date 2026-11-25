import type { CSSProperties } from 'react';

/**
 * Everyone gets a highlighter. The color is derived from the person's name
 * (FNV-1a hash), so it's the same on every screen and for every viewer without
 * storing anything. Names rather than ids because ids are random per database,
 * and the login screen, which knows only names, should agree with the app.
 */
export const HIGHLIGHTERS = [
  { name: 'lemon', ink: '#ffe45c', deep: '#8a6d00' },
  { name: 'mint', ink: '#8ff0c4', deep: '#0f6b47' },
  { name: 'rose', ink: '#ffa6c9', deep: '#9c2459' },
  { name: 'sky', ink: '#9ed8ff', deep: '#135e8f' },
  { name: 'apricot', ink: '#ffc27a', deep: '#8f4a00' },
  { name: 'lilac', ink: '#cdb8ff', deep: '#5233a6' },
] as const;

export type Highlighter = (typeof HIGHLIGHTERS)[number];

export function highlighterFor(name: string): Highlighter {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return HIGHLIGHTERS[hash % HIGHLIGHTERS.length]!;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** CSS custom properties for anything drawn in a person's color. */
export function personStyle(name: string): CSSProperties {
  const h = highlighterFor(name);
  return { '--person': h.ink, '--person-deep': h.deep } as CSSProperties;
}
