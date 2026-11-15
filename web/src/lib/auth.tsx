import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  api,
  refreshAccessToken,
  setAccessToken,
  setUnauthorizedHandler,
} from './api';
import type { User } from '../types';

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let bootstrapPromise: Promise<User | null> | null = null;

function bootstrapSession(): Promise<User | null> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const refreshed = await refreshAccessToken();
      if (!refreshed) return null;
      try {
        const data = await api<{ user: User }>('/auth/me');
        return data.user;
      } catch {
        return null;
      }
    })();
  }
  return bootstrapPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    bootstrapSession().then((restored) => {
      if (!cancelled) {
        setUser(restored);
        setLoading(false);
      }
    });

    setUnauthorizedHandler(() => {
      setAccessToken(null);
      setUser(null);
    });

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api<{ accessToken: string; user: User }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      queryClient.clear();
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const data = await api<{ accessToken: string; user: User }>('/auth/register', {
        method: 'POST',
        body: input,
      });
      setAccessToken(data.accessToken);
      setUser(data.user);
      queryClient.clear();
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const reloadUser = useCallback(async () => {
    const data = await api<{ user: User }>('/auth/me');
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, reloadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
