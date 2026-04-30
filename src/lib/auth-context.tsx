"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Role } from "./constants";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  agencyId?: string;
};

type AuthContextValue = {
  user: User | null;
  /** 初回マウント時の /api/auth/me 呼び出し中は true */
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 初回マウント時にサーバ側セッションから状態を再水和
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!active) return;
        if (res.ok) {
          const data = (await res.json()) as User;
          setUser(data);
        } else if (res.status >= 500) {
          // 一時的なサーバ障害ではログイン状態を変更しない
          // （ログアウトflashを避ける。Cookie 自体は依然として有効）
        } else {
          // 401/403 等は明示的に未認証として扱う
          setUser(null);
        }
      } catch {
        // ネットワーク切断時も状態は変更しない
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as User;
      setUser(data);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Cookie クリア応答が失敗してもクライアント状態は破棄する
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
