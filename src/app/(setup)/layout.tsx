import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";

/** Minimal shell for setup flows: no sidebar, just the logo and a way out. */
export default function SetupLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-foreground text-base font-bold text-white">
            k
          </span>
          <span className="text-lg font-semibold tracking-tight">kerncms</span>
        </Link>
        <Link href="/" className={buttonStyles({ variant: "ghost", size: "sm" })}>
          Abbrechen
        </Link>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
