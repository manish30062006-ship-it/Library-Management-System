import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  BookPlus,
  CopyPlus,
  Layers,
  Pencil,
  Save,
  Search,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced } from '../lib/useDebounced';
import { Cover } from '../components/Cover';
import { Stars } from '../components/Stars';
import {
  EmptyState,
  ErrorNote,
  Notice,
  PageHeader,
  Section,
  Spinner,
  buttonClass,
  fieldClass,
  tableClass,
  tdClass,
  thClass,
} from '../components/ui';
import type { Book, SearchResponse } from '../types';

interface BookForm {
  title: string;
  subtitle: string;
  authors: string;
  isbn: string;
  publisher: string;
  publishedYear: string;
  language: string;
  pages: string;
  subjects: string;
  description: string;
  coverUrl: string;
  initialCopies: string;
  location: string;
}

const EMPTY_FORM: BookForm = {
  title: '',
  subtitle: '',
  authors: '',
  isbn: '',
  publisher: '',
  publishedYear: '',
  language: 'en',
  pages: '',
  subjects: '',
  description: '',
  coverUrl: '',
  initialCopies: '1',
  location: '',
};

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function formFromBook(book: Book): BookForm {
  return {
    title: book.title,
    subtitle: book.subtitle ?? '',
    authors: book.authors.join(', '),
    isbn: book.isbn,
    publisher: book.publisher ?? '',
    publishedYear: book.publishedYear ? String(book.publishedYear) : '',
    language: book.language,
    pages: book.pages ? String(book.pages) : '',
    subjects: book.subjects.join(', '),
    description: book.description ?? '',
    coverUrl: book.coverUrl ?? '',
    initialCopies: '0',
    location: '',
  };
}

export function ManageBooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [search, setSearch] = useState('');
  const [form, setForm] = useState<BookForm>(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiesTarget, setCopiesTarget] = useState<Book | null>(null);
  const [copiesCount, setCopiesCount] = useState('1');
  const [copiesLocation, setCopiesLocation] = useState('');
  const debounced = useDebounced(search.trim(), 300);

  const listParams = new URLSearchParams({ pageSize: '50', sort: 'newest' });
  if (debounced) listParams.set('q', debounced);

  const list = useQuery({
    queryKey: ['books', 'manage', debounced],
    queryFn: () => api<SearchResponse>(`/books?${listParams.toString()}`),
    placeholderData: (previous) => previous,
  });

  const editing = useQuery({
    queryKey: ['book', editId],
    queryFn: () => api<Book>(`/books/${editId}`),
    enabled: Boolean(editId),
  });

  useEffect(() => {
    if (!editId) {
      setForm(EMPTY_FORM);
      return;
    }
    if (editing.data) setForm(formFromBook(editing.data));
  }, [editId, editing.data]);

  const invalidateBooks = () => {
    queryClient.invalidateQueries({ queryKey: ['books'] });
    if (editId) queryClient.invalidateQueries({ queryKey: ['book', editId] });
  };

  const save = useMutation<Book, Error>({
    mutationFn: () => {
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || undefined,
        authors: splitList(form.authors),
        isbn: form.isbn.trim(),
        publisher: form.publisher.trim() || undefined,
        publishedYear: form.publishedYear ? Number(form.publishedYear) : undefined,
        language: form.language.trim() || 'en',
        pages: form.pages ? Number(form.pages) : undefined,
        subjects: splitList(form.subjects),
        description: form.description.trim() || undefined,
        coverUrl: form.coverUrl.trim() || undefined,
        ...(editId
          ? {}
          : {
              initialCopies: Number(form.initialCopies) || 0,
              location: form.location.trim() || undefined,
            }),
      };
      return api<Book>(editId ? `/books/${editId}` : '/books', {
        method: editId ? 'PATCH' : 'POST',
        body: payload,
      });
    },
    onSuccess: (book) => {
      setNotice(
        editId
          ? `Updated “${book.title}”.`
          : `Created “${book.title}” with ${form.initialCopies || 0} initial copies.`,
      );
      setForm(EMPTY_FORM);
      setSearchParams({});
      invalidateBooks();
    },
  });

  const addCopies = useMutation<{ items: unknown[] }, Error>({
    mutationFn: () =>
      api<{ items: unknown[] }>(`/books/${copiesTarget?.id}/copies`, {
        method: 'POST',
        body: {
          count: Number(copiesCount) || 1,
          location: copiesLocation.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      setNotice(
        `Added ${result.items.length} ${
          result.items.length === 1 ? 'copy' : 'copies'
        } to “${copiesTarget?.title}”.`,
      );
      setCopiesTarget(null);
      setCopiesCount('1');
      setCopiesLocation('');
      invalidateBooks();
    },
  });

  const archive = useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/books/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      setNotice('Title archived and removed from search.');
      if (editId === id) setSearchParams({});
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
  });

  const canSubmit =
    form.title.trim().length > 0 &&
    form.isbn.trim().length >= 10 &&
    splitList(form.authors).length > 0 &&
    !save.isPending;

  const field = (
    label: string,
    key: keyof BookForm,
    options: { placeholder?: string; type?: string; required?: boolean } = {},
  ) => (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-stone-400">
        {label}
        {options.required ? <span className="text-amber-600"> *</span> : null}
      </span>
      <input
        type={options.type ?? 'text'}
        value={form[key]}
        required={options.required}
        min={options.type === 'number' ? 0 : undefined}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        placeholder={options.placeholder}
        className={fieldClass}
      />
    </label>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Collection"
        title="Manage books"
        subtitle="Add titles, adjust metadata, and stock additional copies."
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                setSearchParams({});
                setForm(EMPTY_FORM);
                setNotice(null);
              }}
              className={buttonClass}
            >
              <BookPlus className="h-4 w-4" /> New title
            </button>
          </>
        }
      />

      {notice ? (
        <div className="mb-4">
          <Notice>{notice}</Notice>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[370px_1fr]">
        <div className="space-y-4">
          <Section
            title={editId ? 'Edit title' : 'Add a title'}
            action={
              editId ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchParams({});
                    setForm(EMPTY_FORM);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-stone-800"
                >
                  <X className="h-3.5 w-3.5" /> Cancel edit
                </button>
              ) : undefined
            }
          >
            {editId && editing.isError ? <ErrorNote error={editing.error} /> : null}
            {editId && editing.isLoading ? (
              <Spinner label="Loading title…" />
            ) : editId && editing.isError ? (
              <p className="text-sm text-stone-500">
                The title could not be loaded. Cancel the edit and choose another title.
              </p>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setNotice(null);
                  save.mutate();
                }}
                className="space-y-3"
              >
                {field('Title', 'title', { required: true, placeholder: 'The Midnight Library' })}
                {field('Subtitle', 'subtitle', { placeholder: 'Optional' })}
                {field('Authors', 'authors', {
                  required: true,
                  placeholder: 'Comma separated',
                })}
                <div className="grid grid-cols-2 gap-2">
                  {field('ISBN', 'isbn', { required: true, placeholder: '9780525559474' })}
                  {field('Language', 'language', { placeholder: 'en' })}
                </div>
                {field('Publisher', 'publisher')}
                <div className="grid grid-cols-2 gap-2">
                  {field('Year', 'publishedYear', { type: 'number', placeholder: '2020' })}
                  {field('Pages', 'pages', { type: 'number', placeholder: '304' })}
                </div>
                {field('Subjects', 'subjects', {
                  placeholder: 'Fiction, Philosophy',
                })}
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                    Description
                  </span>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    rows={3}
                    className={`${fieldClass} resize-y`}
                    placeholder="Short blurb for the catalogue"
                  />
                </label>
                {field('Cover image URL', 'coverUrl', {
                  type: 'url',
                  placeholder: 'https://…',
                })}

                {!editId ? (
                  <div className="grid grid-cols-[90px_1fr] gap-2">
                    {field('Copies', 'initialCopies', { type: 'number' })}
                    {field('Location', 'location', { placeholder: 'Main shelves' })}
                  </div>
                ) : null}

                <ErrorNote error={save.error} />
                <button type="submit" disabled={!canSubmit} className={`${buttonClass} w-full`}>
                  <Save className="h-4 w-4" />
                  {save.isPending
                    ? 'Saving…'
                    : editId
                      ? 'Save changes'
                      : 'Create title'}
                </button>
              </form>
            )}
          </Section>

          {copiesTarget ? (
            <Section
              title="Add copies"
              action={
                <button
                  type="button"
                  onClick={() => setCopiesTarget(null)}
                  className="rounded p-1 text-stone-400 hover:text-stone-700"
                  aria-label="Cancel adding copies"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            >
              <p className="-mt-2 mb-3 text-xs text-stone-500">
                “{copiesTarget.title}” currently has {copiesTarget.totalCopies} copies (
                {copiesTarget.availableCopies} available).
              </p>
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={copiesCount}
                  onChange={(event) => setCopiesCount(event.target.value)}
                  className={fieldClass}
                  aria-label="Number of copies"
                />
                <input
                  value={copiesLocation}
                  onChange={(event) => setCopiesLocation(event.target.value)}
                  placeholder="Location (optional)"
                  className={fieldClass}
                />
              </div>
              <ErrorNote error={addCopies.error} />
              <button
                type="button"
                onClick={() => addCopies.mutate()}
                disabled={addCopies.isPending}
                className={`${buttonClass} mt-3 w-full`}
              >
                <CopyPlus className="h-4 w-4" />
                {addCopies.isPending ? 'Adding…' : 'Add copies'}
              </button>
            </Section>
          ) : null}

          <ErrorNote error={archive.error} />
        </div>

        <Section
          title="Collection"
          action={
            <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
              <Layers className="h-3.5 w-3.5" />
              {list.data?.total ?? 0} titles
            </span>
          }
        >
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the collection"
              className={`${fieldClass} pl-9`}
            />
          </div>

          <ErrorNote error={list.error} />

          {list.isLoading ? (
            <Spinner label="Loading collection…" />
          ) : list.data?.items.length ? (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Title</th>
                    <th className={thClass}>ISBN</th>
                    <th className={thClass}>Copies</th>
                    <th className={thClass}>Rating</th>
                    <th className={thClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((book) => (
                    <tr key={book.id}>
                      <td className={tdClass}>
                        <div className="flex items-center gap-2">
                          <Cover
                            title={book.title}
                            coverUrl={book.coverUrl}
                            className="h-14 w-10 shrink-0"
                          />
                          <div className="min-w-0">
                            <Link
                              to={`/books/${book.id}`}
                              className="line-clamp-1 font-medium text-stone-800 hover:text-amber-800"
                            >
                              {book.title}
                            </Link>
                            <p className="line-clamp-1 text-[11px] text-stone-500">
                              {book.authors.join(', ')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={`${tdClass} font-mono text-[11px]`}>{book.isbn}</td>
                      <td className={tdClass}>
                        <span className="text-stone-800">{book.availableCopies}</span>
                        <span className="text-stone-400"> / {book.totalCopies}</span>
                      </td>
                      <td className={tdClass}>
                        <Stars rating={book.ratingAvg} />
                      </td>
                      <td className={tdClass}>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSearchParams({ edit: book.id });
                              setNotice(null);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                            title="Edit metadata"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCopiesTarget(book);
                              setNotice(null);
                            }}
                            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                            title="Add copies"
                          >
                            <CopyPlus className="h-3.5 w-3.5" />
                          </button>
                          {user?.role === 'ADMIN' ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Archive “${book.title}”? It will disappear from the catalogue.`,
                                  )
                                ) {
                                  archive.mutate(book.id);
                                }
                              }}
                              disabled={archive.isPending}
                              className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                              title="Archive title"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(list.data.total ?? 0) > list.data.items.length ? (
                <p className="mt-3 text-[11px] text-stone-400">
                  Showing the first {list.data.items.length} of {list.data.total} titles. Use
                  search to narrow the list.
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={BookPlus}
              title="No titles found"
              body={
                debounced
                  ? 'Try a different search.'
                  : 'Add the first title with the form on the left.'
              }
            />
          )}
        </Section>
      </div>
    </div>
  );
}
