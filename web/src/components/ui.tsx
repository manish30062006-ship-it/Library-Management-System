import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, Inbox, type LucideIcon } from 'lucide-react';
import { errorMessage } from '../lib/api';

const badgeTones: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-800 ring-rose-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  stone: 'bg-stone-100 text-stone-700 ring-stone-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

export function Badge({
  tone = 'stone',
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-stone-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label ?? 'Loading…'}</span>
    </div>
  );
}

export function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-stone-100">
      <div className="flex flex-col items-center gap-3 text-stone-500">
        <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
        <span className="text-sm">Opening the catalogue…</span>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-3xl leading-tight text-stone-900">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-stone-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-stone-400">
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-display text-lg text-stone-800">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-stone-500">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{errorMessage(error)}</span>
    </div>
  );
}

export function Notice({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'amber' }) {
  const styles =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : 'border-amber-200 bg-amber-50 text-amber-900';
  return <div className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-stone-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const fieldClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:bg-stone-100 disabled:text-stone-500';

export const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40';

export const subtleButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40';

export const amberButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40';

export const tableClass = 'w-full text-left text-sm';
export const thClass =
  'border-b border-stone-200 pb-2 pr-4 text-[11px] font-semibold uppercase tracking-wide text-stone-400';
export const tdClass = 'border-b border-stone-100 py-3 pr-4 align-top text-stone-700';
