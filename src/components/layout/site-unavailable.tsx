"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRight, FileWarning, Loader2, LogOut, RotateCcw } from "lucide-react";
import { Logo } from "@/components/auth/auth-shell";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/display";
import { toast } from "@/components/ui/toast";
import { logout } from "@/server/actions/auth";
import { resetDraft, switchSite } from "@/server/actions/site";

/**
 * Shown instead of the app when the current site cannot be opened, e.g. kern.config.yaml is missing on its branch.
 * Without it the layout would fail and leave only a bare error page with no way to switch sites.
 */
export function SiteUnavailable({
  site,
  reason,
  kind,
  sites,
  isAdmin,
  canReset,
}: {
  site: { id: string; name: string; branch: string; repo: string | null };
  reason: string;
  /** "config": kern.config.yaml missing or invalid; "git": the checkout could not be prepared. */
  kind: "config" | "git";
  sites: { id: string; name: string }[];
  isAdmin: boolean;
  /** The live branch has kern.config.yaml, only the draft lacks it. */
  canReset: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const others = sites.filter((s) => s.id !== site.id);

  function open(id: string) {
    startTransition(async () => {
      const result = await switchSite(id);
      if (!result.ok) toast.error("Wechseln fehlgeschlagen", { description: result.error });
      else router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetDraft();
      if (!result.ok) return void toast.error("Zurücksetzen fehlgeschlagen", { description: result.error });
      toast.success("Entwurf neu gestartet", { description: result.data.backup ? `Der alte Entwurf liegt im Branch ${result.data.backup}.` : undefined });
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <Logo size={32} />
      <Card className="flex w-full max-w-lg flex-col gap-6 p-8">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <FileWarning className="size-6" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">„{site.name}“ lässt sich nicht öffnen</h1>
          <p className="text-[15px] break-words text-muted">{reason}</p>
          {kind === "config" ? (
          <p className="text-[15px] text-muted">
            kerncms liest die Einstellungen der Website aus <code className="font-mono text-foreground">kern.config.yaml</code> auf dem Branch{" "}
            <code className="font-mono text-foreground">{site.branch}</code>
            {site.repo && (
              <>
                {" "}
                von <code className="font-mono text-foreground">{site.repo}</code>
              </>
            )}
            . Sobald die Datei dort liegt, lädt diese Seite normal.
          </p>
          ) : (
            <p className="text-[15px] text-muted">Der Arbeitsstand der Website konnte nicht vorbereitet werden. Das liegt meist am Repository oder an den Zugriffsrechten.</p>
          )}
        </div>
        {canReset && (
          <div className="flex flex-col gap-3 rounded-xl bg-subtle p-4">
            <p className="text-sm text-muted">
              Auf <code className="font-mono text-foreground">{site.branch}</code> ist die Datei vorhanden, nur der Entwurf von kerncms ist auf einem alten
              Stand. Starte den Entwurf neu vom Live-Stand. Der alte Entwurf bleibt als Sicherung in einem eigenen Branch.
            </p>
            <ConfirmDialog
              title="Entwurf neu starten?"
              description={`Der Entwurf wird durch den Stand von ${site.branch} ersetzt. Unveröffentlichte Änderungen im alten Entwurf bleiben im Branch kern/draft-backup-… erhalten, sind aber nicht mehr im CMS sichtbar.`}
              confirmLabel="Entwurf neu starten"
              triggerClassName={buttonStyles({ className: "w-fit" })}
              trigger={
                <>
                  {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  Entwurf neu starten
                </>
              }
              onConfirm={reset}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {isAdmin && (
            <Link href="/admin/sites" className={buttonStyles({ variant: canReset ? "secondary" : "primary" })}>
              Websites verwalten
            </Link>
          )}
          <Button variant="secondary" onClick={() => router.refresh()} disabled={pending}>
            Erneut laden
          </Button>
        </div>
        {others.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <span className="text-sm font-medium text-muted">Andere Website öffnen</span>
            {others.map((s) => (
              <Button key={s.id} variant="ghost" className="justify-between" onClick={() => open(s.id)} disabled={pending}>
                {s.name}
                {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              </Button>
            ))}
          </div>
        )}
      </Card>
      <form action={logout}>
        <Button type="submit" variant="ghost" size="sm">
          <LogOut />
          Abmelden
        </Button>
      </form>
    </div>
  );
}
