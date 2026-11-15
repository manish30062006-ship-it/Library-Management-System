export const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

/** Number of started overdue days; 0 when not overdue. */
export function overdueDays(dueAt: Date, at: Date = new Date()): number {
  const elapsed = at.getTime() - dueAt.getTime();
  if (elapsed <= 0) return 0;
  return Math.ceil(elapsed / DAY_MS);
}

/** UTC calendar key used for notification dedupe. */
export function dateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
