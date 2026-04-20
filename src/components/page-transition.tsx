"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";

type Phase = "visible" | "out" | "swap" | "in";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("visible");
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      setPhase("swap");
      const timer = setTimeout(() => setPhase("in"), 30);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  const handleClick = useCallback((e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("#") || href === pathname) return;
    setPhase("out");
  }, [pathname]);

  useEffect(() => {
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [handleClick]);

  const style: React.CSSProperties =
    phase === "out"
      ? { opacity: 0, filter: "blur(16px)", transition: "opacity 260ms ease-out, filter 260ms ease-out" }
      : phase === "swap"
        ? { opacity: 0, filter: "blur(16px)", transition: "none" }
        : phase === "in"
          ? { opacity: 1, filter: "blur(0px)", transition: "opacity 350ms ease-out, filter 350ms ease-out" }
          : { opacity: 1 };

  return (
    <div className="flex-1 flex flex-col" style={style}>
      {children}
    </div>
  );
}
