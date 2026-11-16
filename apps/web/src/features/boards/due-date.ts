/**
 * Due dates are picked as a calendar day and stored as the last millisecond of that day in the
 * user's local time, so "overdue" flips exactly when the day ends.
 */

export type DueStatus = 'overdue' | 'today' | 'soon' | 'later';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** "2026-12-01" → ISO for 2026-12-01 23:59:59.999 local time. */
export function toDueIso(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) throw new Error(`Invalid date "${day}"`);
  return new Date(year, month - 1, date, 23, 59, 59, 999).toISOString();
}

/** ISO → "YYYY-MM-DD" in local time (the value a date input expects). */
export function fromDueIso(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole local days from today to the due day (0 = today, negative = past). */
export function daysUntil(iso: string, now: Date): number {
  return Math.round((startOfLocalDay(new Date(iso)).getTime() - startOfLocalDay(now).getTime()) / DAY_MS);
}

export function dueStatus(iso: string, now: Date): DueStatus {
  if (new Date(iso).getTime() < now.getTime()) return 'overdue';
  const days = daysUntil(iso, now);
  if (days <= 0) return 'today';
  if (days <= 2) return 'soon';
  return 'later';
}

export function formatDue(iso: string, now: Date): string {
  const days = daysUntil(iso, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "3 minutes ago", "yesterday", … */
export function timeAgo(iso: string, now: Date): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return RELATIVE.format(seconds, 'second');
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return RELATIVE.format(Math.round(seconds / 3600), 'hour');
  if (abs < 30 * 86_400) return RELATIVE.format(Math.round(seconds / 86_400), 'day');
  return new Date(iso).toLocaleDateString();
}
