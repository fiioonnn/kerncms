import Link from "next/link";
import { Logo } from "@/components/auth/auth-shell";
import { buttonStyles } from "@/components/ui/button";

/** Minimal shell for setup flows: no sidebar, just the logo and a way out. */
export default function SetupLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-8">
        <Link href="/" aria-label="kerncms">
          <Logo className="h-8 w-auto" />
        </Link>
        <Link href="/" className={buttonStyles({ variant: "ghost", size: "sm" })}>
          Abbrechen
        </Link>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
