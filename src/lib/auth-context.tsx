"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
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
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// 管理者・承認者はハードコード（環境変数 or DB 管理への移行は今後の拡張）
const SYSTEM_USERS: (User & { password: string })[] = [
  {
    id: "sys-admin",
    email: "admin@example.com",
    name: "自社管理者",
    role: "admin",
    password: process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "admin",
  },
  {
    id: "sys-approver",
    email: "approver@example.com",
    name: "承認者",
    role: "approver",
    password: process.env.NEXT_PUBLIC_APPROVER_PASSWORD ?? "approver",
  },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    // 管理者・承認者はクライアント側で照合
    const sys = SYSTEM_USERS.find(
      (u) => u.email === email && u.password === password
    );
    if (sys) {
      const { password: _, ...u } = sys;
      setUser(u);
      return true;
    }

    // 代理店は DB 経由で認証
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return false;
      const data = await res.json() as User;
      setUser(data);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
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
