import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  BookPlus,
  Clock3,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { clockTimeFull, initials } from '../lib/format';
import type { NotificationResponse, Role } from '../types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Catalogue', icon: BookOpen, end: true },
  { to: '/my', label: 'My Library', icon: BookMarked, roles: ['MEMBER'] },
  { to: '/circulation', label: 'Circulation', icon: LayoutDashboard, roles: ['ADMIN', 'LIBRARIAN'] },
  { to: '/members', label: 'Members', icon: Users, roles: ['ADMIN', 'LIBRARIAN'] },
  { to: '/manage/books', label: 'Manage books', icon: BookPlus, roles: ['ADMIN', 'LIBRARIAN'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['ADMIN', 'LIBRARIAN'] },
  { to: '/notifications', label: 'Notifications', icon: Bell },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  LIBRARIAN: 'Librarian',
  MEMBER: 'Member',
};

function IstClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5"
      title="Indian Standard Time — updates every second"
    >
      <Clock3 className="h-3.5 w-3.5 text-amber-600" />
      <span className="text-[11px] font-semibold tabular-nums text-stone-700">
        {clockTimeFull(now)}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">IST</span>
    </div>
  );
}

function titleFor(pathname: string): string {
  if (/^\/books\/[^/]+$/.test(pathname)) return 'Book details';
  const match = [...NAV]
    .filter((item) => item.to !== '/')
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname.startsWith(item.to));
  return match?.label ?? 'Catalogue';
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: inbox } = useQuery({
    queryKey: ['notifications', 'badge'],
    queryFn: () => api<NotificationResponse>('/notifications/me?pageSize=1'),
    enabled: Boolean(user),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (!user) return null;

  const items = NAV.filter((item) => !item.roles || item.roles.includes(user.role));
  const unread = inbox?.unreadCount ?? 0;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-stone-800 text-white shadow-inner'
        : 'text-stone-400 hover:bg-stone-900 hover:text-stone-100'
    }`;

  return (
    <div className="min-h-screen bg-stone-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-stone-800 bg-stone-950 md:flex">
        <Link to="/" className="flex items-center gap-3 px-6 py-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-stone-950">
            <LibraryBig className="h-5 w-5" />
          </span>
          <span>
            <span className="font-display text-xl text-white">Athenaeum</span>
            <span className="block text-[10px] uppercase tracking-[0.25em] text-stone-500">
              Library system
            </span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === '/notifications' && unread > 0 ? (
                <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-stone-950">
                  {unread}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-stone-800 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-stone-900/70 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400 text-xs font-bold text-stone-950">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-100">{user.name}</p>
              <p className="truncate text-[11px] text-stone-500">{ROLE_LABEL[user.role]}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              className="rounded-lg p-1.5 text-stone-500 transition hover:bg-stone-800 hover:text-stone-200"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/" className="md:hidden">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-950 text-amber-400">
                  <LibraryBig className="h-4 w-4" />
                </span>
              </Link>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                  {ROLE_LABEL[user.role]}
                </p>
                <h1 className="truncate font-display text-xl text-stone-900">
                  {titleFor(location.pathname)}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <IstClock />
              <Link
                to="/notifications"
                className="relative rounded-xl border border-stone-200 bg-white p-2 text-stone-500 transition hover:text-stone-900"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              >
                <Bell className="h-4 w-4" />
                {unread > 0 ? (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                ) : null}
              </Link>
              <div className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 sm:flex">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-amber-300">
                  {initials(user.name)}
                </span>
                <span className="max-w-32 truncate text-xs font-medium text-stone-700">
                  {user.name}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-stone-200 bg-white p-2 text-stone-500 transition hover:text-stone-900 md:hidden"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? 'bg-stone-900 text-white'
                      : 'bg-white text-stone-600 ring-1 ring-stone-200'
                  }`
                }
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
          <div className="animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
