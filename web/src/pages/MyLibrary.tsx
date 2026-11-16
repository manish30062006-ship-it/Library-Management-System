import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  CreditCard,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { clockTime, daysFromNow, money, shortDate, stamp, titleCase } from '../lib/format';
import { Cover } from '../components/Cover';
import {
  Badge,
  EmptyState,
  ErrorNote,
  Spinner,
  buttonClass,
  tableClass,
  tdClass,
  thClass,
} from '../components/ui';
import type { Fine, Loan, MemberDesk } from '../types';

type Tab = 'loans' | 'fines' | 'history';

function statusTone(status: MemberDesk['member']['status']) {
  return status === 'ACTIVE' ? 'green' : status === 'SUSPENDED' ? 'red' : 'stone';
}

function fineTone(status: Fine['status']) {
  switch (status) {
    case 'PAID':
      return 'green' as const;
    case 'PARTIAL':
      return 'amber' as const;
    case 'WAIVED':
      return 'stone' as const;
    default:
      return 'red' as const;
  }
}

function LoanCard({ loan }: { loan: Loan }) {
  const daysLeft = daysFromNow(loan.dueAt);

  return (
    <article className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <Cover
        title={loan.book?.title ?? 'Book'}
        coverUrl={loan.book?.coverUrl}
        className="h-28 w-20 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/books/${loan.bookId}`}
              className="font-display text-lg leading-snug text-stone-900 hover:text-amber-800"
            >
              {loan.book?.title ?? 'Unknown title'}
            </Link>
            <p className="truncate text-xs text-stone-500">
              {loan.book?.authors.join(', ')}
            </p>
          </div>
          {loan.overdue ? (
            <Badge tone="red">
              <AlertTriangle className="h-3 w-3" /> Overdue
            </Badge>
          ) : (
            <Badge tone="green">Issued</Badge>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-stone-400">Issued on</dt>
            <dd className="font-medium text-stone-700">{shortDate(loan.checkedOutAt)}</dd>
          </div>
          <div>
            <dt className="text-stone-400">Due</dt>
            <dd className="font-medium text-stone-700">{shortDate(loan.dueAt)}</dd>
          </div>
          <div>
            <dt className="text-stone-400">Copy</dt>
            <dd className="font-medium text-stone-700">{loan.copy?.copyCode ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-stone-400">{loan.overdue ? 'Fine accruing' : 'Time left'}</dt>
            <dd
              className={`font-medium ${loan.overdue ? 'text-rose-700' : 'text-stone-700'}`}
            >
              {loan.overdue
                ? money(loan.projectedFineCents)
                : `${Math.max(0, daysLeft)} day${daysLeft === 1 ? '' : 's'}`}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-[11px] text-stone-500">
          Issued by{' '}
          <span className="font-medium text-stone-700">
            {loan.issuedBy?.name ?? 'the circulation desk'}
          </span>{' '}
          · {stamp(loan.checkedOutAt)}
        </p>
        <p className="mt-1 text-[11px] text-stone-400">
          Issue, renewal and return are handled by the librarian at the circulation desk.
        </p>
      </div>
    </article>
  );
}

export function MyLibrary() {
  const [tab, setTab] = useState<Tab>('loans');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me', 'summary'],
    queryFn: () => api<MemberDesk>('/me/summary'),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  if (isLoading) return <Spinner label="Opening your library card…" />;
  if (isError || !data) return <ErrorNote error={error} />;

  const { member } = data;

  const openFines = data.fines.filter(
    (f) => f.status === 'PENDING' || f.status === 'PARTIAL',
  );

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'loans', label: 'Issued books', count: data.activeLoans.length },
    { key: 'fines', label: 'Fines', count: openFines.length },
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-950 via-stone-900 to-stone-800 p-6 text-stone-100 shadow-lg md:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-400">
              <Sparkles className="h-3 w-3" /> Member card
            </p>
            <h1 className="mt-2 font-display text-3xl text-white">{member.user.name}</h1>
            <p className="mt-1 text-sm text-stone-400">
              {member.membershipNo} · joined {shortDate(member.joinedAt)}
            </p>
          </div>
          <div className="text-right">
            <Badge tone={statusTone(member.status)}>{titleCase(member.status)}</Badge>
            <p className="mt-2 text-[11px] text-stone-500">
              Valid through {shortDate(member.expiresAt)}
            </p>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-3 gap-3">
          {[
            ['Books issued', String(data.activeLoans.length), `${member.maxLoans} allowed`],
            ['Past issues', String(data.history.length), 'in your record'],
            ['Dues', money(data.outstandingFineCents), 'pay at the desk'],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3 md:p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{label}</p>
              <p className="mt-1 font-display text-xl text-white md:text-2xl">{value}</p>
              <p className="text-[10px] text-stone-500">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === item.key
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-amber-300'
            }`}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  tab === item.key ? 'bg-white/15' : 'bg-stone-100'
                }`}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'loans' ? (
        <div className="space-y-3">
          {data.activeLoans.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No books issued"
              body="Ask the librarian at the circulation desk to issue a book to your membership."
              action={
                <Link to="/" className={buttonClass}>
                  Browse the catalogue
                </Link>
              }
            />
          ) : (
            data.activeLoans.map((loan) => <LoanCard key={loan.id} loan={loan} />)
          )}
        </div>
      ) : null}

      {tab === 'fines' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-stone-600">
              <Wallet className="h-4 w-4 text-amber-600" />
              Outstanding balance
            </div>
            <p className="font-display text-2xl text-stone-900">
              {money(data.outstandingFineCents)}
            </p>
          </div>

          {data.fines.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No fines on your account"
              body="Return items on time and your record stays clean."
            />
          ) : (
            data.fines.map((fine) => (
              <article
                key={fine.id}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg text-stone-900">
                      {titleCase(fine.reason)}
                    </p>
                    <p className="text-xs text-stone-500">
                      Assessed {stamp(fine.assessedAt)}
                      {fine.loan?.copy?.copyCode
                        ? ` · copy ${fine.loan.copy.copyCode}`
                        : ''}
                    </p>
                  </div>
                  <Badge tone={fineTone(fine.status)}>{titleCase(fine.status)}</Badge>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">
                      Amount
                    </p>
                    <p className="font-medium text-stone-800">{money(fine.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">
                      Paid
                    </p>
                    <p className="font-medium text-stone-800">{money(fine.paidAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">
                      Remaining
                    </p>
                    <p className="font-medium text-rose-700">
                      {money(fine.remainingCents)}
                    </p>
                  </div>
                </div>

                {fine.note ? (
                  <p className="mt-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs text-stone-500">
                    {fine.note}
                  </p>
                ) : null}

                {fine.payments.length ? (
                  <div className="mt-3 border-t border-stone-100 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                      Payments
                    </p>
                    {fine.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between py-1 text-xs text-stone-600"
                      >
                        <span>
                          {stamp(payment.paidAt)} · {titleCase(payment.method)}
                          {payment.receivedBy?.name
                            ? ` · received by ${payment.receivedBy.name}`
                            : ''}
                        </span>
                        <span className="font-medium">{money(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}

          {data.outstandingFineCents > 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              Payments are accepted at the circulation desk. Staff will record your payment and
              update your balance immediately.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white p-4">
          {data.history.length === 0 ? (
            <EmptyState title="No past issues yet" body="Your returned titles will appear here." />
          ) : (
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Title</th>
                  <th className={thClass}>Copy</th>
                  <th className={thClass}>Issued by</th>
                  <th className={thClass}>Borrowed (IST)</th>
                  <th className={thClass}>Returned (IST)</th>
                  <th className={thClass}>Fine</th>
                  <th className={thClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((loan) => (
                  <tr key={loan.id}>
                    <td className={tdClass}>
                      <Link
                        to={`/books/${loan.bookId}`}
                        className="font-medium text-stone-800 hover:text-amber-800"
                      >
                        {loan.book?.title ?? 'Unknown'}
                      </Link>
                    </td>
                    <td className={tdClass}>{loan.copy?.copyCode ?? '—'}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {loan.issuedBy?.name ?? '—'}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {shortDate(loan.checkedOutAt)}
                      <span className="mt-0.5 block text-[10px] text-stone-400">
                        {clockTime(loan.checkedOutAt)} IST
                      </span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {shortDate(loan.returnedAt)}
                      <span className="mt-0.5 block text-[10px] text-stone-400">
                        {clockTime(loan.returnedAt)} IST
                      </span>
                    </td>
                    <td className={tdClass}>
                      {loan.fineAmount > 0 ? money(loan.fineAmount) : '—'}
                    </td>
                    <td className={tdClass}>
                      <Badge tone={loan.status === 'RETURNED' ? 'green' : 'red'}>
                        {titleCase(loan.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
