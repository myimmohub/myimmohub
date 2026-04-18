"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const s = localStorage.getItem("theme");
    if (s === "light" || s === "dark") return s;
  } catch {}
  return "system";
}

function getResolvedTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applyTheme(resolved: "light" | "dark") {
  if (resolved === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    applyTheme(getResolvedTheme(stored));

    // Keep in sync if system preference changes and theme === "system"
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (getStoredTheme() === "system") {
        applyTheme(mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      if (next === "system") {
        localStorage.removeItem("theme");
      } else {
        localStorage.setItem("theme", next);
      }
    } catch {}
    applyTheme(getResolvedTheme(next));
  }, []);

  const toggle = useCallback(() => {
    const current = getResolvedTheme(getStoredTheme());
    setTheme(current === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggle };
}
