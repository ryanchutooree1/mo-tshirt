"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AdminTheme = "light" | "dark";

type AdminThemeContextValue = {
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
  toggleTheme: () => void;
  ready: boolean;
};

const STORAGE_KEY = "admin-theme-v1";
const AdminThemeCtx = createContext<AdminThemeContextValue | null>(null);

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AdminTheme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "dark" || saved === "light") {
        setThemeState(saved);
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    document.documentElement.style.colorScheme = theme;
  }, [theme, ready]);

  const setTheme = (nextTheme: AdminTheme) => setThemeState(nextTheme);
  const toggleTheme = () =>
    setThemeState((current) => (current === "dark" ? "light" : "dark"));

  const value = useMemo<AdminThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme, ready }),
    [theme, ready]
  );

  return (
    <AdminThemeCtx.Provider value={value}>
      <div
        className={`admin-root ${theme === "dark" ? "admin-dark" : "admin-light"}`}
        data-admin-theme={theme}
      >
        {children}
      </div>
    </AdminThemeCtx.Provider>
  );
}

export function useAdminTheme() {
  const ctx = useContext(AdminThemeCtx);
  if (!ctx) {
    throw new Error("useAdminTheme must be used within AdminThemeProvider");
  }
  return ctx;
}
