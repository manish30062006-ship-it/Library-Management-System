import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  CopyPlus,
  Library,
  MessageSquare,
  Pencil,
  Star,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { shortDate, titleCase } from '../lib/format';
import { Cover } from '../components/Cover';
import { Stars } from '../components/Stars';
import {
  Badge,
  ErrorNote,
  Notice,
  buttonClass,
  fieldClass,
  subtleButtonClass,
} from '../components/ui';
import type { Book, MemberDesk, Review } from '../types';

export function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<string | null>(null);
  const [copiesCount, setCopiesCount] = useState('1');
  const [copiesLocation, setCopiesLocation] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');

  const isMember = user?.role === 'MEMBER';
  const isStaff = user?.role === 'ADMIN' || user?.role === 'LIBRARIAN';

  const bookQuery = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => api<Book>(`/books/${bookId}`),
    enabled: Boolean(bookId),
  });

  const reviewsQuery = useQuery({
    queryKey: ['reviews', bookId],
    queryFn: () => api<{ items: Review[] }>(`/books/${bookId}/reviews`),
    enabled: Boolean(bookId),
  });

  const summaryQuery = useQuery({
    queryKey: ['me', 'summary'],
    queryFn: () => api<MemberDesk>('/me/summary'),
    enabled: isMember,
  });

  const addCopies = useMutation<{ items: unknown[] }, Error>({
    mutationFn: () =>
      api<{ items: unknown[] }>(`/books/${bookId}/copies`, {
        method: 'POST',
        body: {
          count: Number(copiesCount) || 1,
          location: copiesLocation.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      setNotice(
        `Added ${result.items.length} ${result.items.length === 1 ? 'copy' : 'copies'}.`,
      );
      setCopiesCount('1');
      setCopiesLocation('');
      queryClient.invalidateQueries({ queryKey: ['book', bookId] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
  });

  const archive = useMutation<void, Error>({
    mutationFn: () => api<void>(`/books/${bookId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      navigate('/');
    },
  });

  const review = useMutation<
    Review,
    Error,
    { rating: number; title?: string; body: string }
  >({
    mutationFn: (input) =>
      api<Review>(`/books/${bookId}/reviews`, { method: 'POST', body: input }),
    onSuccess: () => {
      setReviewTitle('');
      setReviewBody('');
      setNotice('Thank you — your review is live.');
      queryClient.invalidateQueries({ queryKey: ['reviews', bookId] });
      queryClient.invalidateQueries({ queryKey: ['book', bookId] });
    },
  });

  if (bookQuery.isLoading) {
    return <p className="py-16 text-center text-sm text-stone-500">Opening the book…</p>;
  }

  if (bookQuery.isError || !bookQuery.data) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <p className="font-display text-xl text-stone-900">Book not found</p>
        <p className="mt-1 text-sm text-stone-500">This title may have been removed.</p>
        <Link to="/" className={`${buttonClass} mt-4`}>
          Back to catalogue
        </Link>
      </div>
    );
  }

  const book = bookQuery.data;
  const summary = summaryQuery.data;
  const activeLoan = summary?.activeLoans.find((loan) => loan.bookId === book.id);
  const canReview =
    isMember &&
    (summary?.history.some(
      (loan) => loan.bookId === book.id && loan.status === 'RETURNED',
    ) ??
      false);

  const copyRows = Object.entries(book.copiesByStatus).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {notice ? (
        <div className="mb-4">
          <Notice>{notice}</Notice>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <Cover
            title={book.title}
            coverUrl={book.coverUrl}
            className="mx-auto aspect-[2/3] w-full max-w-[260px] shadow-xl"
          />

          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
              Availability
            </p>
            <p className="mt-1 font-display text-2xl text-stone-900">
              {book.availableCopies}
              <span className="ml-1 text-sm font-normal text-stone-400">
                of {book.totalCopies} copies
              </span>
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {copyRows.length === 0 ? (
                <span className="text-xs text-stone-400">No physical copies yet.</span>
              ) : (
                copyRows.map(([status, count]) => (
                  <span
                    key={status}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      status === 'AVAILABLE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : status === 'ON_LOAN'
                          ? 'bg-stone-100 text-stone-600'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {status === 'ON_LOAN' ? 'Issued' : titleCase(status)} · {count}
                  </span>
                ))
              )}
            </div>
          </div>

          {isMember ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="font-display text-lg text-stone-900">Your access</p>
              {summaryQuery.isLoading ? (
                <p className="mt-2 text-xs text-stone-400">Checking your account…</p>
              ) : activeLoan ? (
                <div className="mt-2 space-y-2 text-sm text-stone-600">
                  <Badge tone="green">Issued to you</Badge>
                  <p className="text-xs">
                    Issued {shortDate(activeLoan.checkedOutAt)} · due{' '}
                    {shortDate(activeLoan.dueAt)} · copy{' '}
                    {activeLoan.copy?.copyCode ?? '—'}
                  </p>
                  <Link to="/my" className="text-xs font-semibold text-amber-700">
                    View in My Library →
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-stone-500">
                  {book.availableCopies > 0
                    ? `${book.availableCopies} cop${book.availableCopies === 1 ? 'y is' : 'ies are'} on the shelf. Ask the librarian at the circulation desk to issue this title to you.`
                    : 'All copies are currently issued. Ask the librarian at the circulation desk about the waiting list.'}
                </p>
              )}
            </div>
          ) : null}

          {isStaff ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="font-display text-lg text-stone-900">Staff actions</p>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-[80px_1fr] gap-2">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={copiesCount}
                    onChange={(event) => setCopiesCount(event.target.value)}
                    className={fieldClass}
                    aria-label="Copies to add"
                  />
                  <input
                    value={copiesLocation}
                    onChange={(event) => setCopiesLocation(event.target.value)}
                    placeholder="Location (optional)"
                    className={fieldClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => addCopies.mutate()}
                  disabled={addCopies.isPending}
                  className={`${buttonClass} w-full`}
                >
                  <CopyPlus className="h-4 w-4" />
                  {addCopies.isPending ? 'Adding…' : 'Add copies'}
                </button>
                <ErrorNote error={addCopies.error} />
                <Link
                  to={`/manage/books?edit=${book.id}`}
                  className={`${subtleButtonClass} w-full`}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit metadata
                </Link>
                {user?.role === 'ADMIN' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Archive this title? It disappears from the catalogue and search.',
                        )
                      ) {
                        archive.mutate();
                      }
                    }}
                    disabled={archive.isPending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {archive.isPending ? 'Archiving…' : 'Archive title'}
                  </button>
                ) : null}
                <ErrorNote error={archive.error} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {book.subjects.slice(0, 5).map((subject) => (
              <Badge key={subject} tone="amber">
                {subject}
              </Badge>
            ))}
          </div>
          <h1 className="mt-3 font-display text-4xl leading-tight text-stone-900">
            {book.title}
          </h1>
          {book.subtitle ? (
            <p className="mt-1 font-display text-lg text-stone-500">{book.subtitle}</p>
          ) : null}
          <p className="mt-2 text-sm font-medium text-stone-700">
            {book.authors.join(' · ') || 'Unknown author'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Stars rating={book.ratingAvg} count={book.ratingCount} />
            <span className="inline-flex items-center gap-1 text-xs text-stone-500">
              <CalendarDays className="h-3.5 w-3.5" />
              {book.publishedYear ?? 'Year unknown'}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-stone-500">
              <Library className="h-3.5 w-3.5" />
              {book.publisher ?? 'Independent'}
            </span>
          </div>

          <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-stone-600">
            {book.description ?? 'No description has been added for this title yet.'}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-stone-200 bg-white p-5 text-sm sm:grid-cols-4">
            {[
              ['ISBN', book.isbn],
              ['Language', book.language.toUpperCase()],
              ['Pages', book.pages ? String(book.pages) : '—'],
              ['Added', shortDate(book.createdAt)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                  {label}
                </dt>
                <dd className="mt-0.5 break-words text-stone-800">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-xl text-stone-900">
                <MessageSquare className="h-4 w-4 text-amber-600" /> Reader reviews
              </h2>
              <span className="text-xs text-stone-400">
                {reviewsQuery.data?.items.length ?? 0} review
                {(reviewsQuery.data?.items.length ?? 0) === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-3">
              {(reviewsQuery.data?.items ?? []).map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-stone-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-amber-300">
                        {item.memberName
                          .split(' ')
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-stone-800">
                          {item.memberName}
                          {item.verifiedBorrow ? (
                            <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> verified
                            </span>
                          ) : null}
                        </p>
                        <Stars rating={item.rating} />
                      </div>
                    </div>
                    <span className="text-[11px] text-stone-400">
                      {shortDate(item.createdAt)}
                    </span>
                  </div>
                  {item.title ? (
                    <p className="mt-3 text-sm font-semibold text-stone-800">{item.title}</p>
                  ) : null}
                  <p className="mt-1 text-sm leading-relaxed text-stone-600">{item.body}</p>
                </article>
              ))}

              {!reviewsQuery.isLoading && !reviewsQuery.data?.items.length ? (
                <p className="rounded-2xl border border-dashed border-stone-300 bg-white/50 px-4 py-6 text-center text-sm text-stone-400">
                  No reviews yet.
                </p>
              ) : null}
            </div>

            {canReview ? (
              <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
                <p className="font-display text-lg text-stone-900">Write a review</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  You borrowed and returned this title, so your review is verified.
                </p>
                <div className="mt-3 flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((position) => (
                    <button
                      key={position}
                      type="button"
                      onClick={() => setReviewRating(position)}
                      aria-label={`${position} star${position === 1 ? '' : 's'}`}
                      className="rounded p-0.5"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          position <= reviewRating
                            ? 'fill-amber-500 text-amber-500'
                            : 'fill-none text-stone-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <input
                  value={reviewTitle}
                  onChange={(event) => setReviewTitle(event.target.value)}
                  placeholder="Review title (optional)"
                  className={`${fieldClass} mt-3`}
                />
                <textarea
                  value={reviewBody}
                  onChange={(event) => setReviewBody(event.target.value)}
                  rows={4}
                  placeholder="What did you think?"
                  className={`${fieldClass} mt-2 resize-y`}
                />
                <ErrorNote error={review.error} />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      review.mutate({
                        rating: reviewRating,
                        title: reviewTitle.trim() || undefined,
                        body: reviewBody.trim(),
                      })
                    }
                    disabled={review.isPending || reviewBody.trim().length < 3}
                    className={buttonClass}
                  >
                    {review.isPending ? 'Posting…' : 'Post review'}
                  </button>
                </div>
              </div>
            ) : isMember ? (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-500">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Reviews open after you borrow and return this title.
              </p>
            ) : (
              <p className="mt-4 rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-500">
                Only member accounts can post reviews.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
