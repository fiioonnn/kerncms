"use client";

import { useSyncExternalStore } from "react";

/*
 * Light or dark UI. An explicit choice is stored in the "kern-theme" cookie, which the
 * root layout turns into class="light" / class="dark" on <html> (so the first paint is
 * already right). Without a choice the system setting decides via CSS.
 */

export const THEME_COOKIE = "kern-theme";

const media = () => matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function isDark() {
  const html = document.documentElement.classList;
  if (html.contains("dark")) return true;
  if (html.contains("light")) return false;
  return media().matches;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const m = media();
  m.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    m.removeEventListener("change", listener);
  };
}

export function setDarkMode(dark: boolean) {
  const html = document.documentElement.classList;
  html.toggle("dark", dark);
  html.toggle("light", !dark);
  document.cookie = `${THEME_COOKIE}=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
}

/** Whether the UI is dark right now (explicit choice or system). */
export function useDarkMode() {
  return useSyncExternalStore(subscribe, isDark, () => false);
}
