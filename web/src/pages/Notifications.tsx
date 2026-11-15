import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BellOff,
  BookMarked,
  CalendarClock,
  Check,
  CheckCheck,
  CreditCard,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import {
  Badge,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  buttonClass,
  subtleButtonClass,
} from '../components/ui';
import type { NotificationItem, NotificationResponse } from '../types';

const ICONS: Record<
  NotificationItem['type'],
  { icon: LucideIcon; className: string }
> = {
  HOLD_READY: { icon: BookMarked, className: 'bg-emerald-50 text-emerald-700' },
  DUE_SOON: { icon: CalendarClock, className: 'bg-amber-50 text-amber-700' },
  OVERDUE: { icon: AlertTriangle, className: 'bg-rose-50 text-rose-700' },
  FINE: { icon: Wallet, className: 'bg-rose-50 text-rose-700' },
  PAYMENT: { icon: CreditCard, className: 'bg-sky-50 text-sky-700' },
  SYSTEM: { icon: Sparkles, className: 'bg-stone-100 text-stone-600' },
};

export function Notifications() {
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['notifications', 'page', unreadOnly],
    queryFn: () =>
      api<NotificationResponse>(
        `/notifications/me?pageSize=50${unreadOnly ? '&unread=true' : ''}`,
      ),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const markOne = useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const markAll = useMutation<{ updated: number }, Error>({
    mutationFn: () =>
      api<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: invalidate,
  });

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        subtitle="Hold pickups, due-soon reminders, overdue notices, fines, and payments."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-stone-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setUnreadOnly(false)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  unreadOnly ? 'text-stone-500 hover:text-stone-800' : 'bg-stone-900 text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setUnreadOnly(true)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  unreadOnly ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
              </button>
            </div>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={unreadCount === 0 || markAll.isPending}
              className={subtleButtonClass}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {markAll.isPending ? 'Marking…' : 'Mark all read'}
            </button>
          </div>
        }
      />

      <ErrorNote error={markOne.error ?? markAll.error} />

      {isLoading ? (
        <Spinner label="Opening your inbox…" />
      ) : isError ? (
        <ErrorNote error={error} />
      ) : data?.items.length ? (
        <div className="space-y-2">
          {data.items.map((item) => {
            const meta = ICONS[item.type] ?? ICONS.SYSTEM;
            const Icon = meta.icon;
            const bookId =
              item.data && typeof item.data.bookId === 'string'
                ? item.data.bookId
                : null;
            const unread = !item.readAt;
            return (
              <article
                key={item.id}
                className={`flex gap-3 rounded-2xl border p-4 shadow-sm transition ${
                  unread
                    ? 'border-amber-200 bg-amber-50/40'
                    : 'border-stone-200 bg-white'
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${meta.className}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                        {item.title}
                        {unread ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        ) : null}
                      </p>
                      <p className="text-[11px] text-stone-400">
                        {dateTime(item.createdAt)} · {item.type.replace('_', ' ')}
                      </p>
                    </div>
                    {!unread ? <Badge tone="stone">Read</Badge> : null}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-stone-600">
                    {item.body}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {bookId ? (
                      <Link
                        to={`/books/${bookId}`}
                        className="text-xs font-semibold text-amber-700 hover:text-amber-800"
                      >
                        View title →
                      </Link>
                    ) : null}
                    {unread ? (
                      <button
                        type="button"
                        onClick={() => markOne.mutate(item.id)}
                        disabled={markOne.isPending && markOne.variables === item.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {markOne.isPending && markOne.variables === item.id
                          ? 'Marking…'
                          : 'Mark read'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={BellOff}
          title={unreadOnly ? 'No unread notifications' : 'Inbox zero'}
          body={
            unreadOnly
              ? 'You are all caught up. Switch to All to review older messages.'
              : 'Hold pickups, due dates, and payments will show up here.'
          }
          action={
            unreadOnly ? (
              <button
                type="button"
                onClick={() => setUnreadOnly(false)}
                className={buttonClass}
              >
                View all
              </button>
            ) : (
              <Link to="/" className={buttonClass}>
                Browse the catalogue
              </Link>
            )
          }
        />
      )}
    </div>
  );
}
