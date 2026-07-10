"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AdminTheme = "light" | "dark";

type AdminThemeContextValue = {
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
  toggleTheme: () => void;
  ready: boolean;
};

const STORAGE_KEY = "admin-theme-v2";
const AdminThemeCtx = createContext<AdminThemeContextValue | null>(null);

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AdminTheme>("light");
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
    const previousColorScheme = document.documentElement.style.colorScheme;
    const previousRootBackground = document.documentElement.style.backgroundColor;
    const previousBodyBackground = document.body.style.backgroundColor;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor = theme === "dark" ? "#050806" : "#ffffff";
    document.body.style.backgroundColor = theme === "dark" ? "#050806" : "#ffffff";

    return () => {
      document.documentElement.style.colorScheme = previousColorScheme;
      document.documentElement.style.backgroundColor = previousRootBackground;
      document.body.style.backgroundColor = previousBodyBackground;
    };
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
