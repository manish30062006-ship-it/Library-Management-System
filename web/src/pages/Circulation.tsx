import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  CreditCard,
  Search,
  UserRoundSearch,
  Wallet,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced } from '../lib/useDebounced';
import { dateTime, money, shortDate, titleCase } from '../lib/format';
import {
  Badge,
  EmptyState,
  ErrorNote,
  Notice,
  Section,
  Spinner,
  buttonClass,
  fieldClass,
  subtleButtonClass,
  tableClass,
  tdClass,
  thClass,
} from '../components/ui';
import type {
  Book,
  Fine,
  Loan,
  LoanListResponse,
  MemberDesk,
  ReturnResult,
  SearchResponse,
} from '../types';

function FineRow({
  fine,
  canWaive,
  onChanged,
}: {
  fine: Fine;
  canWaive: boolean;
  onChanged: () => void;
}) {
  const [amount, setAmount] = useState((fine.remainingCents / 100).toFixed(2));
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'ONLINE'>('CASH');
  const [paid, setPaid] = useState(false);

  const pay = useMutation<Fine, Error>({
    mutationFn: () =>
      api<Fine>(`/fines/${fine.id}/payments`, {
        method: 'POST',
        body: { amount: Math.round(Number(amount) * 100), method },
      }),
    onSuccess: () => {
      setPaid(true);
      onChanged();
    },
  });

  const waive = useMutation<Fine, Error>({
    mutationFn: () =>
      api<Fine>(`/fines/${fine.id}/waive`, {
        method: 'POST',
        body: { note: 'Waived at the circulation desk' },
      }),
    onSuccess: () => {
      setPaid(true);
      onChanged();
    },
  });

  const cents = Math.round(Number(amount) * 100);
  const invalidAmount = !Number.isFinite(cents) || cents <= 0 || cents > fine.remainingCents;

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-stone-800">
            {titleCase(fine.reason)} · {money(fine.remainingCents)} remaining
          </p>
          <p className="text-[11px] text-stone-500">
            Assessed {shortDate(fine.assessedAt)}
            {fine.loan?.copy?.copyCode ? ` · copy ${fine.loan.copy.copyCode}` : ''}
          </p>
        </div>
        <Badge tone={fine.status === 'PARTIAL' ? 'amber' : 'red'}>
          {titleCase(fine.status)}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">
            ₹
          </span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={`${fieldClass} w-24 py-1.5 pl-6 text-xs`}
            aria-label="Payment amount in rupees"
          />
        </div>
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as 'CASH' | 'CARD' | 'ONLINE')}
          className={`${fieldClass} w-24 py-1.5 text-xs`}
          aria-label="Payment method"
        >
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="ONLINE">Online</option>
        </select>
        <button
          type="button"
          onClick={() => pay.mutate()}
          disabled={pay.isPending || invalidAmount || paid}
          className={`${subtleButtonClass} py-1.5 text-xs`}
        >
          <CreditCard className="h-3.5 w-3.5" />
          {pay.isPending ? 'Recording…' : 'Record payment'}
        </button>
        {canWaive ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Waive the remaining ${money(fine.remainingCents)}?`)) {
                waive.mutate();
              }
            }}
            disabled={waive.isPending || paid}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            Waive
          </button>
        ) : null}
      </div>

      {paid ? (
        <p className="mt-2 text-[11px] font-medium text-emerald-700">
          Balance updated. Member notified.
        </p>
      ) : null}
      <ErrorNote error={pay.error ?? waive.error} />
    </div>
  );
}

function MemberSnapshot({ desk }: { desk: MemberDesk }) {
  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-stone-900 text-[11px] font-bold text-amber-300">
            {desk.member.user.name
              .split(' ')
              .slice(0, 2)
              .map((part) => part[0])
              .join('')}
          </span>
          <div>
            <p className="text-sm font-semibold text-stone-800">{desk.member.user.name}</p>
            <p className="text-[11px] text-stone-500">
              {desk.member.membershipNo} · {desk.member.user.email}
            </p>
          </div>
        </div>
        <Badge
          tone={
            desk.member.status === 'ACTIVE'
              ? 'green'
              : desk.member.status === 'SUSPENDED'
                ? 'red'
                : 'stone'
          }
        >
          {titleCase(desk.member.status)}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-stone-600">
        <span>
          Books issued{' '}
          <strong className="text-stone-800">{desk.activeLoans.length}</strong> of{' '}
          {desk.member.maxLoans}
        </span>
        <span>
          Balance{' '}
          <strong className={desk.outstandingFineCents > 0 ? 'text-rose-700' : 'text-stone-800'}>
            {money(desk.outstandingFineCents)}
          </strong>
        </span>
        <span>
          Active holds{' '}
          <strong className="text-stone-800">
            {
              desk.reservations.filter(
                (hold) => hold.status === 'QUEUED' || hold.status === 'READY',
              ).length
            }
          </strong>
        </span>
      </div>
      {desk.member.status !== 'ACTIVE' ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-rose-700">
          <AlertTriangle className="h-3.5 w-3.5" /> Issue will be blocked while the
          membership is {desk.member.status.toLowerCase()}.
        </p>
      ) : null}
    </div>
  );
}

export function Circulation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [memberQuery, setMemberQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [bookQuery, setBookQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [dueInDays, setDueInDays] = useState('');
  const [returnCode, setReturnCode] = useState('');
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);

  const debouncedBookQuery = useDebounced(bookQuery.trim(), 300);

  const lookup = useQuery({
    queryKey: ['member-lookup', submitted],
    queryFn: () =>
      api<MemberDesk>(`/members/lookup?q=${encodeURIComponent(submitted)}`),
    enabled: submitted.length >= 2,
    retry: false,
  });

  const bookSearch = useQuery({
    queryKey: ['books', 'desk', debouncedBookQuery],
    queryFn: () =>
      api<SearchResponse>(
        `/books?q=${encodeURIComponent(debouncedBookQuery)}&pageSize=6`,
      ),
    enabled: debouncedBookQuery.length >= 2,
    placeholderData: (previous) => previous,
  });

  const bookOptions = useQuery({
    queryKey: ['books', 'options'],
    queryFn: async () => {
      const pageSize = 50;
      const first = await api<SearchResponse>(`/books?pageSize=${pageSize}&sort=title`);
      const extraPages = Math.ceil(first.total / pageSize) - 1;
      const rest = await Promise.all(
        Array.from({ length: Math.max(extraPages, 0) }, (_, index) =>
          api<SearchResponse>(
            `/books?pageSize=${pageSize}&page=${index + 2}&sort=title`,
          ),
        ),
      );
      return [...first.items, ...rest.flatMap((page) => page.items)];
    },
    staleTime: 60_000,
  });

  const recentLoans = useQuery({
    queryKey: ['loans', 'active'],
    queryFn: () => api<LoanListResponse>('/loans?status=active&pageSize=10'),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['member-lookup'] });
    queryClient.invalidateQueries({ queryKey: ['loans'] });
    queryClient.invalidateQueries({ queryKey: ['books'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const checkout = useMutation<Loan, Error>({
    mutationFn: () =>
      api<Loan>('/loans/checkout', {
        method: 'POST',
        body: {
          memberQuery: submitted,
          bookId: selectedBook?.id,
          ...(dueInDays ? { dueInDays: Number(dueInDays) } : {}),
        },
      }),
    onSuccess: (loan) => {
      setCheckoutNotice(
        `Issued “${loan.book?.title ?? loan.copy?.copyCode ?? 'copy'}” — due ${shortDate(
          loan.dueAt,
        )}.`,
      );
      setSelectedBook(null);
      setBookQuery('');
      refresh();
    },
  });

  const returnLoan = useMutation<
    ReturnResult,
    Error,
    { copyCode?: string; loanId?: string }
  >({
    mutationFn: (input) =>
      api<ReturnResult>('/loans/return', { method: 'POST', body: input }),
    onSuccess: (result) => {
      const parts = [
        `Returned “${result.loan.book?.title ?? result.loan.copy?.copyCode ?? 'copy'}”.`,
      ];
      parts.push(
        result.fineCents > 0
          ? `Fine assessed: ${money(result.fineCents)}.`
          : 'No fine due.',
      );
      if (result.promotedReservationId) {
        parts.push('The next hold was promoted and the member notified.');
      }
      setReturnNotice(parts.join(' '));
      setReturnCode('');
      refresh();
    },
  });

  const handleFind = (event: FormEvent) => {
    event.preventDefault();
    const value = memberQuery.trim();
    if (value.length < 2) return;
    setCheckoutNotice(null);
    if (value === submitted) lookup.refetch();
    else setSubmitted(value);
  };

  const openFines =
    lookup.data?.fines.filter(
      (fine) => fine.status === 'PENDING' || fine.status === 'PARTIAL',
    ) ?? [];

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
          Front desk
        </p>
        <h1 className="font-display text-3xl text-stone-900">Circulation</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-500">
          Look up the student, search the title they need, and issue it. The desk enforces
          issue limits, fines, and holds.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Section title="1 · Find a member">
            <form onSubmit={handleFind} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder="Card number, email, or name"
                  className={`${fieldClass} pl-9`}
                />
              </div>
              <button
                type="submit"
                disabled={memberQuery.trim().length < 2}
                className={buttonClass}
              >
                <UserRoundSearch className="h-4 w-4" /> Find
              </button>
            </form>

            {lookup.isFetching ? (
              <p className="mt-2 text-[11px] text-stone-400">Searching members…</p>
            ) : null}
            <ErrorNote error={lookup.error} />

            {lookup.data ? <MemberSnapshot desk={lookup.data} /> : null}
            {!lookup.data && !lookup.error ? (
              <p className="mt-2 text-[11px] text-stone-400">
                Try a demo member: <code>member@library.dev</code>, <code>priya@library.dev</code>,
                or a membership card number.
              </p>
            ) : null}
          </Section>

          <Section title="2 · Issue a book">
            <div className="space-y-3">
              {selectedBook ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-800">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-800">
                          {selectedBook.title}
                        </p>
                        <p className="truncate text-[11px] text-stone-500">
                          {selectedBook.authors.join(', ')}
                        </p>
                        <Badge
                          tone={selectedBook.availableCopies > 0 ? 'green' : 'red'}
                        >
                          {selectedBook.availableCopies > 0
                            ? `${selectedBook.availableCopies} of ${selectedBook.totalCopies} available`
                            : 'All copies issued'}
                        </Badge>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBook(null);
                        setCheckoutNotice(null);
                      }}
                      className={`${subtleButtonClass} px-2 py-1 text-xs`}
                    >
                      <X className="h-3.5 w-3.5" /> Change
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    value=""
                    onChange={(event) => {
                      const book = bookOptions.data?.find(
                        (item) => item.id === event.target.value,
                      );
                      if (book) {
                        setSelectedBook(book);
                        setCheckoutNotice(null);
                      }
                    }}
                    className={fieldClass}
                    aria-label="Pick a book from the catalogue list"
                  >
                    <option value="" disabled>
                      {bookOptions.isLoading
                        ? 'Loading the book list…'
                        : 'Or pick a book from the list (title · ISBN)'}
                    </option>
                    {bookOptions.data?.map((book) => (
                      <option
                        key={book.id}
                        value={book.id}
                        disabled={book.availableCopies === 0}
                      >
                        {book.title} ({book.isbn})
                        {book.availableCopies === 0 ? ' — all issued' : ''}
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <input
                      value={bookQuery}
                      onChange={(event) => {
                        setBookQuery(event.target.value);
                        setCheckoutNotice(null);
                      }}
                      placeholder="Search the book to issue — title, author, or ISBN"
                      className={`${fieldClass} pl-9`}
                    />
                  </div>

                  {debouncedBookQuery.length >= 2 ? (
                    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                      {bookSearch.data?.items.length ? (
                        <ul className="divide-y divide-stone-100">
                          {bookSearch.data.items.map((book) => {
                            const unavailable = book.availableCopies === 0;
                            return (
                              <li key={book.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBook(book);
                                    setCheckoutNotice(null);
                                  }}
                                  disabled={unavailable}
                                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-stone-800">
                                      {book.title}
                                    </span>
                                    <span className="block truncate text-[11px] text-stone-500">
                                      {book.authors.join(', ')} · {book.publishedYear ?? '—'}
                                    </span>
                                  </span>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      unavailable
                                        ? 'bg-rose-50 text-rose-700'
                                        : 'bg-emerald-50 text-emerald-700'
                                    }`}
                                  >
                                    {unavailable
                                      ? 'All issued'
                                      : `${book.availableCopies} available`}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : bookSearch.isFetching ? (
                        <p className="px-3 py-3 text-xs text-stone-400">Searching books…</p>
                      ) : (
                        <p className="px-3 py-3 text-xs text-stone-400">
                          No titles match “{debouncedBookQuery}”.
                        </p>
                      )}
                    </div>
                  ) : null}
                  <ErrorNote error={bookSearch.error} />
                </>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setCheckoutNotice(null);
                  checkout.mutate();
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={dueInDays}
                  onChange={(event) => setDueInDays(event.target.value)}
                  placeholder="Issue period in days"
                  className={`${fieldClass} w-44`}
                  aria-label="Issue period in days (optional)"
                />
                <button
                  type="submit"
                  disabled={
                    !lookup.data ||
                    !selectedBook ||
                    selectedBook.availableCopies === 0 ||
                    checkout.isPending
                  }
                  className={buttonClass}
                >
                  <ArrowUpFromLine className="h-4 w-4" />
                  {checkout.isPending ? 'Issuing…' : 'Issue book'}
                </button>
              </form>
            </div>

            <p className="mt-2 text-[11px] text-stone-400">
              Search and pick the title, then issue. The desk assigns an available copy
              automatically; leave the issue period blank to use the default.
            </p>
            {checkoutNotice ? (
              <div className="mt-3">
                <Notice>{checkoutNotice}</Notice>
              </div>
            ) : null}
            <ErrorNote error={checkout.error} />
          </Section>

          <Section title="3 · Return a copy">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setReturnNotice(null);
                returnLoan.mutate({ copyCode: returnCode.trim() });
              }}
              className="flex gap-2"
            >
              <input
                value={returnCode}
                onChange={(event) => setReturnCode(event.target.value)}
                placeholder="Copy code"
                className={`${fieldClass} uppercase placeholder:normal-case`}
              />
              <button
                type="submit"
                disabled={returnCode.trim().length === 0 || returnLoan.isPending}
                className={buttonClass}
              >
                <ArrowDownToLine className="h-4 w-4" />
                {returnLoan.isPending && returnLoan.variables?.copyCode
                  ? 'Returning…'
                  : 'Return'}
              </button>
            </form>
            <p className="mt-2 text-[11px] text-stone-400">
              Fines are calculated at return. The next queued hold is promoted automatically.
            </p>
            {returnNotice ? (
              <div className="mt-3">
                <Notice>{returnNotice}</Notice>
              </div>
            ) : null}
            <ErrorNote error={returnLoan.error} />
          </Section>
        </div>

        <div className="space-y-5">
          <Section
            title="Issued now"
            action={
              <span className="text-[11px] text-stone-400">
                {recentLoans.data?.total ?? 0} active
              </span>
            }
          >
            {recentLoans.isLoading ? (
              <Spinner label="Loading issued books…" />
            ) : recentLoans.data?.items.length ? (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Title / member</th>
                      <th className={thClass}>Due</th>
                      <th className={thClass} />
                    </tr>
                  </thead>
                  <tbody>
                    {recentLoans.data.items.map((loan) => (
                      <tr key={loan.id}>
                        <td className={tdClass}>
                          <Link
                            to={`/books/${loan.bookId}`}
                            className="line-clamp-1 font-medium text-stone-800 hover:text-amber-800"
                          >
                            {loan.book?.title ?? 'Unknown title'}
                          </Link>
                          <p className="text-[11px] text-stone-500">
                            {loan.member?.user.name ?? '—'} ·{' '}
                            {loan.copy?.copyCode ?? '—'}
                          </p>
                        </td>
                        <td className={tdClass}>
                          <span className={loan.overdue ? 'font-medium text-rose-700' : ''}>
                            {shortDate(loan.dueAt)}
                          </span>
                          {loan.overdue ? (
                            <p className="text-[10px] font-semibold uppercase text-rose-600">
                              Overdue
                            </p>
                          ) : null}
                        </td>
                        <td className={tdClass}>
                          <button
                            type="button"
                            onClick={() => {
                              setReturnNotice(null);
                              returnLoan.mutate({ loanId: loan.id });
                            }}
                            disabled={
                              returnLoan.isPending && returnLoan.variables?.loanId === loan.id
                            }
                            className={`${subtleButtonClass} px-2 py-1 text-xs`}
                          >
                            Return
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No books issued" body="The shelves are quiet." />
            )}
            <ErrorNote error={recentLoans.error} />
          </Section>

          {lookup.data ? (
            <Section
              title="Open fines"
              action={
                <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
                  <Wallet className="h-3.5 w-3.5" />
                  {money(lookup.data.outstandingFineCents)}
                </span>
              }
            >
              {openFines.length === 0 ? (
                <p className="rounded-xl bg-stone-50 px-3 py-3 text-sm text-stone-500">
                  No open fines for {lookup.data.member.user.name}.
                </p>
              ) : (
                <div className="space-y-2">
                  {openFines.map((fine) => (
                    <FineRow
                      key={`${fine.id}-${fine.paidAmount}`}
                      fine={fine}
                      canWaive={user?.role === 'ADMIN'}
                      onChanged={refresh}
                    />
                  ))}
                </div>
              )}
            </Section>
          ) : (
            <Section title="Open fines">
              <p className="flex items-start gap-2 text-sm text-stone-500">
                <UserRoundSearch className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                Find a member first to settle fines.
              </p>
            </Section>
          )}

          {lookup.data?.reservations.length ? (
            <Section title="Member holds">
              <div className="space-y-2">
                {lookup.data.reservations
                  .filter((hold) => hold.status === 'QUEUED' || hold.status === 'READY')
                  .map((hold) => (
                    <div
                      key={hold.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate text-stone-700">
                        {hold.book?.title ?? 'Unknown title'}
                      </span>
                      <span className="text-stone-400">
                        {hold.status === 'READY'
                          ? `Ready · ${dateTime(hold.expiresAt)}`
                          : `Queue ${hold.position ?? '—'}`}
                      </span>
                    </div>
                  ))}
                {lookup.data.reservations.filter(
                  (hold) => hold.status === 'QUEUED' || hold.status === 'READY',
                ).length === 0 ? (
                  <p className="text-xs text-stone-400">No active holds.</p>
                ) : null}
              </div>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
