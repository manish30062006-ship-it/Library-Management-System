import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime, money, titleCase } from '../lib/format';
import { Cover } from '../components/Cover';
import {
  Badge,
  EmptyState,
  ErrorNote,
  PageHeader,
  Section,
  Spinner,
  subtleButtonClass,
  tableClass,
  tdClass,
  thClass,
} from '../components/ui';
import type { AuditResponse, ReportData } from '../types';

function labelForDay(day?: string): string {
  if (!day) return '';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function fillSeries(
  days: number,
  rows: { day: string; value: number }[],
): { key: string; value: number }[] {
  const map = new Map(rows.map((row) => [row.day, row.value]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - 1 - index) * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    return { key, value: map.get(key) ?? 0 };
  });
}

function TrendChart({
  series,
  format,
  accent = 'amber',
  label,
}: {
  series: { key: string; value: number }[];
  format: (value: number) => string;
  accent?: 'amber' | 'emerald';
  label: string;
}) {
  const gradientId = useId().replace(/:/g, '');
  const width = 720;
  const height = 220;
  const pad = 24;
  const max = Math.max(1, ...series.map((point) => point.value));
  const step = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;
  const points = series.map((point, index) => ({
    x: pad + index * step,
    y: height - pad - (point.value / max) * (height - pad * 2),
    ...point,
  }));
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const last = points[points.length - 1];
  const area = `${line} L${last?.x ?? pad},${height - pad} L${pad},${height - pad} Z`;
  const total = series.reduce((sum, point) => sum + point.value, 0);
  const stroke = accent === 'emerald' ? '#059669' : '#d97706';

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-display text-2xl text-stone-900">{format(total)}</p>
        <p className="text-[11px] uppercase tracking-wide text-stone-400">{label}</p>
      </div>
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-48 w-full"
          role="img"
          aria-label={`${label} chart`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((fraction) => {
            const y = pad + (height - pad * 2) * fraction;
            return (
              <line
                key={fraction}
                x1={pad}
                x2={width - pad}
                y1={y}
                y2={y}
                stroke="#e7e5e4"
                strokeDasharray="4 6"
              />
            );
          })}
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {last ? (
            <circle cx={last.x} cy={last.y} r={4} fill={stroke} stroke="white" strokeWidth={2} />
          ) : null}
        </svg>
        {total === 0 ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-stone-400">
            No activity in this window
          </p>
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-stone-400">
        <span>{labelForDay(series[0]?.key)}</span>
        <span>{labelForDay(series[Math.floor(series.length / 2)]?.key)}</span>
        <span>{labelForDay(series[series.length - 1]?.key)}</span>
      </div>
    </div>
  );
}

function BarList({
  rows,
  format,
}: {
  rows: { label: string; value: number; detail?: string }[];
  format: (value: number) => string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) {
    return <p className="text-sm text-stone-400">No data for this window.</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-stone-600">{row.label}</span>
            <span className="font-semibold text-stone-800">{format(row.value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
          {row.detail ? <p className="mt-0.5 text-[10px] text-stone-400">{row.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  highlight,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        highlight ? 'border-amber-200 bg-amber-50/70' : 'border-stone-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
          {label}
        </p>
        <Icon className={`h-4 w-4 ${highlight ? 'text-amber-700' : 'text-stone-400'}`} />
      </div>
      <p className="mt-2 font-display text-2xl text-stone-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-stone-500">{detail}</p>
    </div>
  );
}

export function Reports() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const isAdmin = user?.role === 'ADMIN';

  const report = useQuery({
    queryKey: ['reports', 'dashboard', days],
    queryFn: () => api<ReportData>(`/reports/dashboard?days=${days}`),
  });

  const audit = useQuery({
    queryKey: ['reports', 'audit'],
    queryFn: () => api<AuditResponse>('/reports/audit?pageSize=12'),
    enabled: isAdmin,
  });

  const data = report.data;
  const agingOrder = ['1-7 days', '8-30 days', '31+ days'];
  const agingRows = [...(data?.overdueAging ?? [])].sort(
    (a, b) => agingOrder.indexOf(a.bucket) - agingOrder.indexOf(b.bucket),
  );
  const fineOrder = ['PENDING', 'PARTIAL', 'PAID', 'WAIVED'];
  const fineRows = [...(data?.finesByStatus ?? [])].sort(
    (a, b) => fineOrder.indexOf(a.status) - fineOrder.indexOf(b.status),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Insight"
        title="Reports"
        subtitle="Circulation, holds, revenue, and collection performance — refreshed from MySQL on each load."
        actions={
          <>
            <div className="flex rounded-xl border border-stone-200 bg-white p-1">
              {[7, 30, 90].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    days === option
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  {option}d
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                report.refetch();
                if (isAdmin) audit.refetch();
              }}
              disabled={report.isFetching}
              className={subtleButtonClass}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${report.isFetching ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          </>
        }
      />

      {report.isLoading ? (
        <Spinner label="Crunching the numbers…" />
      ) : report.isError || !data ? (
        <ErrorNote error={report.error} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon={BookOpen}
              label="Books issued"
              value={String(data.kpis.activeLoans)}
              detail={`${data.kpis.overdueLoans} overdue`}
              highlight={data.kpis.overdueLoans > 0}
            />
            <Kpi
              icon={BookMarked}
              label="Holds"
              value={String(data.kpis.readyHolds + data.kpis.queuedHolds)}
              detail={`${data.kpis.readyHolds} ready · ${data.kpis.queuedHolds} queued`}
            />
            <Kpi
              icon={Wallet}
              label="Outstanding fines"
              value={money(data.kpis.outstandingFineCents)}
              detail={`${money(data.kpis.collectedFineCents)} collected in range`}
            />
            <Kpi
              icon={Users}
              label="Members"
              value={String(data.kpis.members)}
              detail={`${data.kpis.activeMembers} active`}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Issues">
              <TrendChart
                label="issues in range"
                format={(value) => String(value)}
                series={fillSeries(
                  days,
                  data.circulationByDay.map((row) => ({
                    day: row.day,
                    value: row.count,
                  })),
                )}
              />
            </Section>
            <Section title="Fine payments">
              <TrendChart
                label="collected in range"
                accent="emerald"
                format={money}
                series={fillSeries(
                  days,
                  data.revenueByDay.map((row) => ({ day: row.day, value: row.cents })),
                )}
              />
            </Section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Most issued">
              {data.topBooks.length === 0 ? (
                <EmptyState title="No issues in this window" body="Try a wider date range." />
              ) : (
                <div className="space-y-2">
                  {data.topBooks.map((row, index) => (
                    <div
                      key={row.bookId}
                      className="flex items-center gap-3 rounded-xl bg-stone-50 p-2"
                    >
                      <span className="w-4 text-center text-xs font-bold text-stone-400">
                        {index + 1}
                      </span>
                      <Cover
                        title={row.book?.title ?? 'Book'}
                        coverUrl={row.book?.coverUrl}
                        className="h-12 w-9 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/books/${row.bookId}`}
                          className="line-clamp-1 text-sm font-medium text-stone-800 hover:text-amber-800"
                        >
                          {row.book?.title ?? 'Unknown title'}
                        </Link>
                        <p className="line-clamp-1 text-[11px] text-stone-500">
                          {row.book?.authors.join(', ')}
                        </p>
                      </div>
                      <Badge tone="amber">{row.loans} issues</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div className="space-y-5">
              <Section title="Overdue aging">
                <BarList
                  format={(value) => String(value)}
                  rows={agingRows.map((row) => ({
                    label: row.bucket,
                    value: row.count,
                    detail: 'days past due',
                  }))}
                />
                {data.kpis.overdueLoans > 0 ? (
                  <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {data.kpis.overdueLoans} active issue
                    {data.kpis.overdueLoans === 1 ? '' : 's'} past due. Overdue notices run
                    every 15 minutes.
                  </p>
                ) : (
                  <p className="mt-3 text-[11px] text-stone-400">
                    Nothing overdue — nice work.
                  </p>
                )}
              </Section>

              <Section title="Fines by status">
                <BarList
                  format={(value) => String(value)}
                  rows={fineRows.map((row) => ({
                    label: `${titleCase(row.status)} (${row.count})`,
                    value: row.amountCents,
                    detail: `${money(row.paidCents)} paid of ${money(row.amountCents)}`,
                  }))}
                />
              </Section>
            </div>
          </div>

          {isAdmin ? (
            <Section
              title="Audit trail"
              action={
                <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
                  <TrendingUp className="h-3.5 w-3.5" /> latest {audit.data?.items.length ?? 0}
                </span>
              }
            >
              {audit.isLoading ? (
                <Spinner label="Loading audit trail…" />
              ) : audit.isError ? (
                <ErrorNote error={audit.error} />
              ) : audit.data?.items.length ? (
                <div className="overflow-x-auto">
                  <table className={tableClass}>
                    <thead>
                      <tr>
                        <th className={thClass}>When</th>
                        <th className={thClass}>Action</th>
                        <th className={thClass}>Entity</th>
                        <th className={thClass}>Actor role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.data.items.map((entry) => (
                        <tr key={entry._id}>
                          <td className={`${tdClass} whitespace-nowrap text-xs`}>
                            {dateTime(entry.createdAt)}
                          </td>
                          <td className={tdClass}>
                            <span className="font-mono text-xs text-stone-800">
                              {entry.action}
                            </span>
                          </td>
                          <td className={tdClass}>
                            <span className="text-xs text-stone-600">
                              {entry.entityType}
                              {entry.entityId ? (
                                <span className="ml-1 font-mono text-[10px] text-stone-400">
                                  {entry.entityId.slice(0, 8)}…
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className={tdClass}>
                            <Badge tone="stone">{entry.actorRole ?? 'SYSTEM'}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-stone-400">No audit entries yet.</p>
              )}
            </Section>
          ) : null}
        </div>
      )}
    </div>
  );
}
