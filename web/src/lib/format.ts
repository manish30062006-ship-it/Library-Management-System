const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
});

export const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_LABEL = 'IST';

export function money(cents: number): string {
  return inr.format(cents / 100);
}

export function shortDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    timeZone: IST_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Full date + time in Indian Standard Time, e.g. "16 Nov 2026, 10:42 pm IST". */
export function dateTime(value?: string | null): string {
  if (!value) return '—';
  const text = new Date(value).toLocaleString('en-IN', {
    timeZone: IST_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${text} ${IST_LABEL}`;
}

/** Compact day + time in IST, e.g. "16 Nov, 10:42 pm IST" — for feeds. */
export function stamp(value?: string | null): string {
  if (!value) return '—';
  const text = new Date(value).toLocaleString('en-IN', {
    timeZone: IST_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${text} ${IST_LABEL}`;
}

/** Clock time in IST, e.g. "10:42 pm". */
export function clockTime(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Live clock face in IST, e.g. "10:42:07 pm". */
export function clockTimeFull(value: Date): string {
  return value.toLocaleTimeString('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Calendar day key (YYYY-MM-DD) in IST, matching the API's IST day buckets. */
export function istDayKey(value: Date): string {
  return value.toLocaleDateString('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** Label an IST day key ("2026-11-16") without timezone drift. */
export function istDayLabel(day?: string): string {
  if (!day) return '';
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  return new Date(Date.UTC(year, month - 1, date, 12)).toLocaleDateString('en-IN', {
    timeZone: IST_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  });
}

export function timeAgo(value?: string | null): string {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 45_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return shortDate(value);
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function daysFromNow(value: string): number {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
