import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  FilterX,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { Cover } from '../components/Cover';
import { Stars } from '../components/Stars';
import {
  Badge,
  EmptyState,
  ErrorNote,
  Spinner,
} from '../components/ui';
import type { FacetBucket, SearchResponse } from '../types';

type SortOption = 'relevance' | 'newest' | 'title' | 'rating';

const SORTS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'newest', label: 'Newest' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'rating', label: 'Highest rated' },
];

function FacetGroup({
  title,
  buckets,
  selected,
  onSelect,
}: {
  title: string;
  buckets: FacetBucket[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  if (!buckets.length) return null;
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {buckets.map((bucket) => {
          const active = selected === bucket.key;
          return (
            <button
              key={bucket.key}
              type="button"
              onClick={() => onSelect(active ? '' : bucket.key)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-amber-300'
              }`}
            >
              {bucket.key}
              <span className={active ? 'text-stone-400' : 'text-stone-400'}>
                {bucket.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BookCard({ book }: { book: SearchResponse['items'][number] }) {
  return (
    <Link
      to={`/books/${book.id}`}
      className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
    >
      <div className="relative">
        <Cover title={book.title} coverUrl={book.coverUrl} className="aspect-[2/3] w-full" />
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${
            book.availableCopies > 0
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {book.availableCopies > 0
            ? `${book.availableCopies} available`
            : 'All copies issued'}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
        <h3 className="font-display text-[15px] leading-snug text-stone-900 line-clamp-2 group-hover:text-amber-800">
          {book.title}
        </h3>
        <p className="mt-1 truncate text-xs text-stone-500">
          {book.authors.join(', ') || 'Unknown author'}
        </p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <Stars rating={book.ratingAvg} count={book.ratingCount || undefined} />
          <span className="text-[10px] uppercase tracking-wide text-stone-400">
            {book.publishedYear ?? ''}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function Catalog() {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [language, setLanguage] = useState('');
  const [publisher, setPublisher] = useState('');
  const [sort, setSort] = useState<SortOption>('relevance');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search.trim(), 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, subject, language, publisher, sort]);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('q', debouncedSearch);
  if (subject) params.set('subject', subject);
  if (language) params.set('language', language);
  if (publisher) params.set('publisher', publisher);
  params.set('sort', sort);
  params.set('page', String(page));
  params.set('pageSize', '12');
  const queryString = params.toString();

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['books', queryString],
    queryFn: () => api<SearchResponse>(`/books?${queryString}`),
    placeholderData: (previous) => previous,
  });

  const activeFilters = [subject, language, publisher].filter(Boolean).length;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 12;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const clearAll = () => {
    setSearch('');
    setSubject('');
    setLanguage('');
    setPublisher('');
    setSort('relevance');
    setPage(1);
  };

  return (
    <div>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-950 via-stone-900 to-stone-800 px-6 py-8 text-stone-100 shadow-lg md:px-10 md:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl"
        />
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-400">
          <Sparkles className="h-3 w-3" /> The stacks
        </p>
        <h1 className="mt-3 max-w-2xl font-display text-3xl leading-tight text-white md:text-4xl">
          Find your next <span className="text-amber-300">good book</span>.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-stone-400">
          Search the full collection by title, author, subject, or ISBN, then check availability
          before asking the librarian to issue a copy.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles, authors, ISBN…"
              aria-label="Search the catalogue"
              className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 pl-11 text-sm text-stone-900 shadow-lg outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-amber-400/60"
            />
          </div>
          <label className="relative">
            <span className="sr-only">Sort results</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-stone-800 px-4 py-3 pr-10 text-sm font-medium text-stone-100 shadow-lg outline-none focus:ring-2 focus:ring-amber-400/60 sm:w-48"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <SlidersHorizontal className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          </label>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-4 shadow-sm lg:sticky lg:top-24">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-display text-base text-stone-900">Refine</p>
            {activeFilters > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800"
              >
                <FilterX className="h-3.5 w-3.5" /> Clear
              </button>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-stone-400">
                {activeFilters} active
              </span>
            )}
          </div>

          <div className="scrollbar-thin max-h-64 space-y-5 overflow-y-auto pr-1 lg:max-h-none">
            <FacetGroup
              title="Subject"
              buckets={data?.facets.subjects ?? []}
              selected={subject}
              onSelect={setSubject}
            />
            <FacetGroup
              title="Language"
              buckets={data?.facets.languages ?? []}
              selected={language}
              onSelect={setLanguage}
            />
            <FacetGroup
              title="Publisher"
              buckets={data?.facets.publishers ?? []}
              selected={publisher}
              onSelect={setPublisher}
            />
            {!data?.facets.subjects.length ? (
              <p className="text-xs text-stone-400">No refinements available yet.</p>
            ) : null}
          </div>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-stone-500">
              {total === 0
                ? 'No titles found'
                : `Showing ${first}–${last} of ${total} title${total === 1 ? '' : 's'}`}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {subject ? (
                <button type="button" onClick={() => setSubject('')}>
                  <Badge tone="amber">{subject} ×</Badge>
                </button>
              ) : null}
              {language ? (
                <button type="button" onClick={() => setLanguage('')}>
                  <Badge tone="blue">{language} ×</Badge>
                </button>
              ) : null}
              {publisher ? (
                <button type="button" onClick={() => setPublisher('')}>
                  <Badge tone="violet">{publisher} ×</Badge>
                </button>
              ) : null}
              {isFetching && data ? (
                <span className="text-[11px] text-stone-400">Updating…</span>
              ) : null}
            </div>
          </div>

          <ErrorNote error={isError ? error : null} />

          {isLoading && !data ? (
            <Spinner label="Searching the shelves…" />
          ) : data && data.items.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing on this shelf"
              body="Try a broader search term or clear your filters."
              action={
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
                >
                  Reset search
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {data?.items.map((book) => <BookCard key={book.id} book={book} />)}
            </div>
          )}

          {pages > 1 ? (
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs text-stone-500">
                Page {page} of {pages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pages, current + 1))}
                  disabled={page >= pages}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
