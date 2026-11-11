"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "kern-editor-sidebar-width";

/** Sidebar width that can be dragged and is remembered per browser. */
export function useResizableWidth({ initial = 400, min = 320, max = 720 } = {}) {
  const [width, setWidth] = useState(initial);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the remembered width once after mount
      if (saved >= min && saved <= max) setWidth(saved);
    } catch {}
  }, [min, max]);

  const clamp = useCallback((value: number) => Math.round(Math.min(max, Math.max(min, value))), [min, max]);

  const persist = useCallback((value: number) => {
    try {
      localStorage.setItem(KEY, String(value));
    } catch {}
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      let latest = startWidth;
      setDragging(true);
      const move = (ev: PointerEvent) => {
        latest = clamp(startWidth + ev.clientX - startX);
        setWidth(latest);
      };
      const up = () => {
        setDragging(false);
        persist(latest);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [width, clamp, persist],
  );

  /** Arrow keys on the handle, for keyboard users. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? 64 : 16;
      let next: number | null = null;
      if (e.key === "ArrowLeft") next = clamp(width - step);
      if (e.key === "ArrowRight") next = clamp(width + step);
      if (e.key === "Home") next = min;
      if (e.key === "End") next = max;
      if (next === null) return;
      e.preventDefault();
      setWidth(next);
      persist(next);
    },
    [width, clamp, persist, min, max],
  );

  const reset = useCallback(() => {
    setWidth(initial);
    persist(initial);
  }, [initial, persist]);

  return { width, dragging, startDrag, onKeyDown, reset, min, max };
}
