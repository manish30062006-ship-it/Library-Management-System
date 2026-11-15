import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LibraryBig, Loader2, LockKeyhole, Mail, Phone, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ErrorNote, fieldClass } from '../components/ui';

const DEMO_ACCOUNTS = [
  {
    role: 'Administrator',
    email: 'admin@library.dev',
    password: 'Admin123!',
    detail: 'Full access · reports · audit',
  },
  {
    role: 'Librarian',
    email: 'librarian@library.dev',
    password: 'Librarian123!',
    detail: 'Circulation · members · catalog',
  },
  {
    role: 'Member',
    email: 'member@library.dev',
    password: 'Member123!',
    detail: 'Catalogue · issued books · dues',
  },
];

export function Login() {
  const { user, login, register } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const from = (location.state as { from?: string } | null)?.from;
  const redirectTo = mode === 'signup' ? '/my' : from && from !== '/login' ? from : '/';

  if (user) return <Navigate to={redirectTo} replace />;

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
    setSubmitting(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'signup') {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
        });
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-stone-950 p-12 text-stone-100 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-400 text-stone-950">
            <LibraryBig className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl">Athenaeum</p>
            <p className="text-[10px] uppercase tracking-[0.3em] text-stone-500">
              Library management
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-400">
            Two stores, one catalogue
          </p>
          <blockquote className="mt-4 font-display text-4xl leading-tight text-white">
            “A library is not a luxury but one of the necessities of life.”
          </blockquote>
          <p className="mt-3 text-sm text-stone-400">Henry Ward Beecher</p>

          <div className="mt-10 grid gap-3">
            {[
              ['Search that reads your mind', 'MongoDB multi-field matching with live facets.'],
              ['Circulation you can trust', 'MySQL transactions keep every copy accounted for.'],
              ['Clear for every member', 'Availability, issued titles, dates, and dues at a glance.'],
            ].map(([title, body]) => (
              <div
                key={title}
                className="flex gap-3 rounded-2xl border border-stone-800 bg-stone-900/60 p-4"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-stone-100">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-stone-600">MySQL · MongoDB</p>
      </section>

      <section className="flex items-center justify-center bg-stone-100 px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-stone-950 text-amber-400">
              <LibraryBig className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-2xl text-stone-900">Athenaeum</p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-stone-500">
                Library management
              </p>
            </div>
          </div>

          <h2 className="font-display text-3xl text-stone-900">
            {mode === 'signup' ? 'Create your library ID' : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {mode === 'signup'
              ? 'Students can register instantly and start borrowing.'
              : 'Sign in with your staff or member account.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            {mode === 'signup' ? (
              <>
                <div>
                  <label
                    htmlFor="name"
                    className="mb-1.5 block text-xs font-semibold text-stone-600"
                  >
                    Full name
                  </label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <input
                      id="name"
                      required
                      minLength={2}
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your full name"
                      className={`${fieldClass} pl-10`}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1.5 block text-xs font-semibold text-stone-600"
                  >
                    Phone <span className="font-normal text-stone-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+91 98765 43210"
                      className={`${fieldClass} pl-10`}
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-stone-600">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@library.dev"
                  className={`${fieldClass} pl-10`}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-semibold text-stone-600"
              >
                Password
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  id="password"
                  type="password"
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className={`${fieldClass} pl-10`}
                />
              </div>
              {mode === 'signup' ? (
                <p className="mt-1 text-[11px] text-stone-400">At least 8 characters.</p>
              ) : null}
            </div>

            <ErrorNote error={error} />

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === 'signup'
                ? submitting
                  ? 'Creating your ID…'
                  : 'Create account'
                : submitting
                  ? 'Signing in…'
                  : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-stone-500">
            {mode === 'signin' ? 'New student?' : 'Already have an ID?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              className="font-semibold text-amber-800 underline-offset-2 hover:underline"
            >
              {mode === 'signin' ? 'Create your library ID' : 'Sign in'}
            </button>
          </p>

          <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
              Demo accounts
            </p>
            <div className="mt-2 space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    switchMode('signin');
                    setEmail(account.email);
                    setPassword(account.password);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left transition hover:border-amber-300 hover:bg-amber-50/40"
                >
                  <span>
                    <span className="block text-sm font-medium text-stone-800">
                      {account.role}
                    </span>
                    <span className="block text-[11px] text-stone-500">{account.detail}</span>
                  </span>
                  <span className="rounded-lg bg-stone-100 px-2 py-1 text-[10px] font-semibold text-stone-500">
                    Use
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
