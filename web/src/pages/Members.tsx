import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  Mail,
  Phone,
  Save,
  Search,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { money, shortDate, stamp, titleCase } from '../lib/format';
import {
  Badge,
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
import type {
  MemberDesk,
  MemberListResponse,
  MemberStatus,
  MemberSummary,
} from '../types';

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  phone: '',
  membershipNo: '',
};

function statusTone(status: MemberStatus) {
  if (status === 'ACTIVE') return 'green' as const;
  if (status === 'SUSPENDED') return 'red' as const;
  return 'stone' as const;
}

export function Members() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<MemberStatus>('ACTIVE');
  const [editMaxLoans, setEditMaxLoans] = useState('5');
  const [editExpires, setEditExpires] = useState('');

  const debounced = useDebounced(search.trim(), 300);
  const params = new URLSearchParams({ pageSize: '50' });
  if (debounced) params.set('q', debounced);

  const list = useQuery({
    queryKey: ['members', debounced],
    queryFn: () => api<MemberListResponse>(`/members?${params.toString()}`),
  });

  const detail = useQuery({
    queryKey: ['member', selectedId],
    queryFn: () => api<MemberDesk>(`/members/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (!detail.data) return;
    setEditStatus(detail.data.member.status);
    setEditMaxLoans(String(detail.data.member.maxLoans));
    setEditExpires(
      detail.data.member.expiresAt
        ? detail.data.member.expiresAt.slice(0, 10)
        : '',
    );
  }, [detail.data]);

  const createMember = useMutation<MemberSummary, Error>({
    mutationFn: () =>
      api<MemberSummary>('/members', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim() || undefined,
          membershipNo: form.membershipNo.trim() || undefined,
        },
      }),
    onSuccess: (member) => {
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setSelectedId(member.id);
      setNotice(
        `Member created — card ${member.membershipNo}. Share the temporary password securely.`,
      );
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  const updateMember = useMutation<MemberSummary, Error>({
    mutationFn: () =>
      api<MemberSummary>(`/members/${selectedId}`, {
        method: 'PATCH',
        body: {
          status: editStatus,
          maxLoans: Number(editMaxLoans) || undefined,
          expiresAt: editExpires
            ? new Date(`${editExpires}T00:00:00.000Z`).toISOString()
            : undefined,
        },
      }),
    onSuccess: () => {
      setNotice('Membership updated.');
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['member', selectedId] });
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Members"
        subtitle="Search the membership roll, open a member's desk, and manage borrowing privileges."
        actions={
          <button
            type="button"
            onClick={() => {
              setShowCreate((current) => !current);
              setNotice(null);
            }}
            className={buttonClass}
          >
            {showCreate ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {showCreate ? 'Close form' : 'New member'}
          </button>
        }
      />

      {notice ? (
        <div className="mb-4">
          <Notice>{notice}</Notice>
        </div>
      ) : null}

      {showCreate ? (
        <div className="mb-6">
          <Section title="Register a member">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setNotice(null);
                createMember.mutate();
              }}
              className="grid gap-3 md:grid-cols-2"
            >
              <input
                required
                minLength={2}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Full name"
                className={fieldClass}
              />
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="Email address"
                className={fieldClass}
              />
              <input
                required
                type="password"
                minLength={8}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="Temporary password (min 8 characters)"
                className={fieldClass}
              />
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="Phone (optional)"
                className={fieldClass}
              />
              <input
                value={form.membershipNo}
                onChange={(event) => setForm({ ...form, membershipNo: event.target.value })}
                placeholder="Card number (optional — generated if blank)"
                className={fieldClass}
              />
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={createMember.isPending}
                  className={buttonClass}
                >
                  <UserPlus className="h-4 w-4" />
                  {createMember.isPending ? 'Creating…' : 'Create member'}
                </button>
              </div>
              <div className="md:col-span-2">
                <ErrorNote error={createMember.error} />
              </div>
            </form>
          </Section>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Section
          title="Membership roll"
          action={
            <span className="text-[11px] text-stone-400">
              {list.data?.total ?? 0} member{(list.data?.total ?? 0) === 1 ? '' : 's'}
            </span>
          }
        >
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, or card number"
              className={`${fieldClass} pl-9`}
            />
          </div>

          <ErrorNote error={list.error} />

          {list.isLoading ? (
            <Spinner label="Loading members…" />
          ) : list.data?.items.length ? (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Member</th>
                    <th className={thClass}>Card</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Issued</th>
                    <th className={thClass}>Fines</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((member) => (
                    <tr
                      key={member.id}
                      onClick={() => {
                        setSelectedId(member.id);
                        setNotice(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') setSelectedId(member.id);
                      }}
                      tabIndex={0}
                      className={`cursor-pointer outline-none transition ${
                        selectedId === member.id
                          ? 'bg-amber-50/70'
                          : 'hover:bg-stone-50 focus:bg-stone-50'
                      }`}
                    >
                      <td className={tdClass}>
                        <p className="font-medium text-stone-800">{member.user.name}</p>
                        <p className="text-[11px] text-stone-500">{member.user.email}</p>
                      </td>
                      <td className={`${tdClass} font-mono text-xs`}>
                        {member.membershipNo}
                      </td>
                      <td className={tdClass}>
                        <Badge tone={statusTone(member.status)}>
                          {titleCase(member.status)}
                        </Badge>
                      </td>
                      <td className={tdClass}>{member.activeLoanCount}</td>
                      <td className={tdClass}>
                        {member.openFineCount > 0 ? (
                          <span className="font-medium text-rose-700">
                            {member.openFineCount} open
                          </span>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="No members found"
              body={debounced ? 'Try a different search.' : 'Register the first member.'}
            />
          )}
        </Section>

        <div className="space-y-5">
          {!selectedId ? (
            <Section title="Member desk">
              <EmptyState
                title="Select a member"
                body="Choose someone from the roll to see their issues, holds, and balance."
              />
            </Section>
          ) : detail.isLoading ? (
            <Section title="Member desk">
              <Spinner label="Opening member…" />
            </Section>
          ) : detail.isError || !detail.data ? (
            <Section title="Member desk">
              <ErrorNote error={detail.error} />
            </Section>
          ) : (
            <>
              <Section
                title="Member desk"
                action={
                  <Badge tone={statusTone(detail.data.member.status)}>
                    {titleCase(detail.data.member.status)}
                  </Badge>
                }
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-stone-900 text-sm font-bold text-amber-300">
                    {detail.data.member.user.name
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-xl text-stone-900">
                      {detail.data.member.user.name}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-stone-500">
                      <Mail className="h-3 w-3" /> {detail.data.member.user.email}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-600">
                  <p className="flex items-center gap-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 text-stone-400" />
                    <span className="font-mono">{detail.data.member.membershipNo}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-stone-400" />
                    {detail.data.member.phone ?? 'No phone'}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-stone-400" />
                    Joined {shortDate(detail.data.member.joinedAt)}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-stone-400" />
                    Expires {shortDate(detail.data.member.expiresAt)}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-3 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">Issued</p>
                    <p className="font-display text-lg text-stone-900">
                      {detail.data.activeLoans.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">Holds</p>
                    <p className="font-display text-lg text-stone-900">
                      {
                        detail.data.reservations.filter(
                          (hold) =>
                            hold.status === 'QUEUED' || hold.status === 'READY',
                        ).length
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-stone-400">
                      Balance
                    </p>
                    <p className="font-display text-lg text-stone-900">
                      {money(detail.data.outstandingFineCents)}
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setNotice(null);
                    updateMember.mutate();
                  }}
                  className="mt-4 grid gap-2 sm:grid-cols-3"
                >
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                    Status
                    <select
                      value={editStatus}
                      onChange={(event) =>
                        setEditStatus(event.target.value as MemberStatus)
                      }
                      className={`${fieldClass} mt-1 py-1.5 text-xs`}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                      <option value="EXPIRED">Expired</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                    Issue limit
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={editMaxLoans}
                      onChange={(event) => setEditMaxLoans(event.target.value)}
                      className={`${fieldClass} mt-1 py-1.5 text-xs`}
                    />
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                    Expires
                    <input
                      type="date"
                      value={editExpires}
                      onChange={(event) => setEditExpires(event.target.value)}
                      className={`${fieldClass} mt-1 py-1.5 text-xs`}
                    />
                  </label>
                  <div className="sm:col-span-3 flex justify-end">
                    <button
                      type="submit"
                      disabled={updateMember.isPending}
                      className={`${buttonClass} py-1.5 text-xs`}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {updateMember.isPending ? 'Saving…' : 'Save membership'}
                    </button>
                  </div>
                </form>
                <ErrorNote error={updateMember.error} />
              </Section>

              <Section title="Current issues">
                {detail.data.activeLoans.length === 0 ? (
                  <p className="text-sm text-stone-500">No books issued.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.data.activeLoans.map((loan) => (
                      <div
                        key={loan.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <Link
                            to={`/books/${loan.bookId}`}
                            className="line-clamp-1 text-sm font-medium text-stone-800 hover:text-amber-800"
                          >
                            {loan.book?.title ?? 'Unknown title'}
                          </Link>
                          <p className="text-[11px] text-stone-500">
                            {loan.copy?.copyCode ?? '—'} · due {shortDate(loan.dueAt)}
                          </p>
                          <p className="text-[10px] text-stone-400">
                            Issued by {loan.issuedBy?.name ?? 'the desk'} ·{' '}
                            {stamp(loan.checkedOutAt)}
                          </p>
                        </div>
                        {loan.overdue ? (
                          <Badge tone="red">Overdue</Badge>
                        ) : (
                          <BookOpen className="h-4 w-4 text-stone-300" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section
                title="Account balance"
                action={
                  <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
                    <Wallet className="h-3.5 w-3.5" />
                    {money(detail.data.outstandingFineCents)}
                  </span>
                }
              >
                {detail.data.fines.length === 0 ? (
                  <p className="text-sm text-stone-500">No fines on record.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.data.fines.slice(0, 6).map((fine) => (
                      <div
                        key={fine.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-stone-600">
                          {titleCase(fine.reason)} · {shortDate(fine.assessedAt)}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-stone-800">
                            {money(fine.remainingCents)}
                          </span>
                          <Badge
                            tone={
                              fine.status === 'PAID'
                                ? 'green'
                                : fine.status === 'WAIVED'
                                  ? 'stone'
                                  : fine.status === 'PARTIAL'
                                    ? 'amber'
                                    : 'red'
                            }
                          >
                            {titleCase(fine.status)}
                          </Badge>
                        </span>
                      </div>
                    ))}
                    <p className="pt-1 text-[11px] text-stone-400">
                      Collect payments from the Circulation desk.
                    </p>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
