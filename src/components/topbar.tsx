import Link from "next/link";

export function Topbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          kerncms
        </Link>
        <nav className="flex items-center gap-4 text-sm text-foreground/70">
          {/* Navigation links and actions go here */}
        </nav>
      </div>
    </header>
  );
}
