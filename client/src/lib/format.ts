import type { Role } from '../api';

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function formatUpdated(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(seconds) < 45) return 'just now';
  if (Math.abs(seconds) < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (Math.abs(seconds) < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (Math.abs(seconds) < 7 * 86_400) return relative.format(Math.round(seconds / 86_400), 'day');
  return absolute.format(new Date(iso));
}

export const roleLabel: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  viewer: 'Can view',
};
