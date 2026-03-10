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

const MOCK_USERS: (User & { password: string })[] = [
  {
    id: "1",
    email: "admin@example.com",
    name: "自社管理者",
    role: "admin",
    password: "admin",
  },
  {
    id: "2",
    email: "agency@example.com",
    name: "株式会社アルファ",
    role: "agency",
    agencyId: "ag-1",
    password: "agency",
  },
  {
    id: "3",
    email: "approver@example.com",
    name: "承認者",
    role: "approver",
    agencyId: "ag-1",
    password: "approver",
  },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    const found = MOCK_USERS.find(
      (u) => u.email === email && u.password === password
    );
    if (!found) return false;
    const { password: _, ...u } = found;
    setUser(u);
    return true;
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
