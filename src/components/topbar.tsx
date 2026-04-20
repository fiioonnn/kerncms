"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ProjectSearch } from "@/components/project-search";
import { ProfileDialog } from "@/components/profile-dialog";
import { useProjects } from "@/components/project-context";
import { useIsAdmin } from "@/lib/auth-client";
import { UpdateBadge } from "@/components/update-badge";

const fade = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
};

export function Topbar() {
  const { current } = useProjects();
  const isSystemAdmin = useIsAdmin();
  const pathname = usePathname();
  const canSeeSettings = isSystemAdmin || current?.role === "admin";

  useEffect(() => {
    document.title = current ? `kerncms — ${current.name}` : "kerncms";
  }, [current]);

  const navItems = [
    { href: "/", label: "Dashboard", show: true, needsOnboarding: false },
    { href: "/content", label: "Content", show: true, needsOnboarding: true },
    { href: "/media", label: "Media", show: true, needsOnboarding: true },
    { href: "/settings", label: "Settings", show: canSeeSettings, needsOnboarding: false },
  ].filter((item) => item.show);

  let idx = 0;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center">
          <motion.div {...fade} transition={{ duration: 0.4, delay: idx++ * 0.06 }}>
            <Link href="/" className="flex items-center gap-1.5">
              <img src="/logo.svg" alt="kern" className="h-5 w-5" />
              <span className="text-xl font-bold font-[family-name:var(--font-averia)]">
                <span className="text-foreground">kern</span><span className="text-muted-foreground/40">cms</span>
              </span>
            </Link>
          </motion.div>

          <UpdateBadge />

        {current && (<>
          <motion.div {...fade} transition={{ duration: 0.3, delay: idx++ * 0.06 }} className="mx-4 h-5 w-px bg-border" />
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const d = idx++ * 0.06;
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const disabled = item.needsOnboarding && !current.onboardingComplete;

              return (
                <motion.div key={item.href} {...fade} transition={{ duration: 0.3, delay: d }}>
                  {disabled ? (
                    <span
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "text-muted-foreground/30 cursor-not-allowed text-[13px] pointer-events-none select-none"
                      )}
                    >
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "hover:text-foreground text-[13px]",
                        item.href === "/" ? "-ml-2" : "",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  )}
                </motion.div>
              );
            })}
          </nav>
        </>)}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {(() => { const rightBase = idx * 0.06 + 0.25; let ri = 0; return (<>
          <motion.div {...fade} transition={{ duration: 0.3, delay: rightBase + ri++ * 0.07 }}>
            <ProjectSearch />
          </motion.div>
          <motion.div {...fade} transition={{ duration: 0.3, delay: rightBase + ri++ * 0.07 }}>
            <ProjectSwitcher />
          </motion.div>
          {current?.url && (<>
            <motion.div {...fade} transition={{ duration: 0.3, delay: rightBase + ri++ * 0.07 }} className="h-5 w-px bg-border" />
            <motion.div {...fade} transition={{ duration: 0.3, delay: rightBase + ri++ * 0.07 }}>
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </a>
            </motion.div>
          </>)}
          <motion.div {...fade} transition={{ duration: 0.3, delay: rightBase + ri++ * 0.07 }}>
            <ProfileDialog />
          </motion.div>
          </>); })()}
        </div>
      </div>
    </header>
  );
}
